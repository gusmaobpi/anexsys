import net from 'node:net';
import tls from 'node:tls';

export type SmtpSecurity = 'none' | 'starttls' | 'ssl';

const TIMEOUT_MS = 15_000;

export async function sendSmtpMessage(input: {
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  assertLine(input.host, 'Servidor');
  assertLine(input.username, 'Usuário da caixa');
  assertLine(input.fromAddress, 'Endereço de envio');
  assertLine(input.to, 'Destinatário');
  const socket = input.security === 'ssl'
    ? tls.connect({ host: input.host, port: input.port, servername: input.host })
    : net.connect({ host: input.host, port: input.port });
  let dialog = new SmtpDialog(socket);
  let current: net.Socket = socket;
  try {
    await waitUntilReady(socket, input.security === 'ssl');
    await dialog.expect(220);
    await dialog.command(`EHLO anexsys`, 250);
    if (input.security === 'starttls') {
      await dialog.command('STARTTLS', 220);
      current = tls.connect({ socket, servername: input.host });
      dialog = new SmtpDialog(current);
      await waitUntilReady(current, true);
      await dialog.command(`EHLO anexsys`, 250);
    }
    if (input.username) {
      await dialog.command('AUTH LOGIN', 334);
      await dialog.command(Buffer.from(input.username, 'utf8').toString('base64'), 334);
      await dialog.command(Buffer.from(input.password, 'utf8').toString('base64'), 235);
    }
    await dialog.command(`MAIL FROM:<${input.fromAddress}>`, 250);
    await dialog.command(`RCPT TO:<${input.to}>`, 250);
    await dialog.command('DATA', 354);
    current.write(`${buildData(input)}\r\n.\r\n`);
    await dialog.expect(250);
    await dialog.command('QUIT', 221);
  } finally {
    current.destroy();
    socket.destroy();
  }
}

function waitUntilReady(socket: net.Socket, secure: boolean): Promise<void> {
  if (secure ? (socket as tls.TLSSocket).authorized || (socket as tls.TLSSocket).encrypted : (socket as net.Socket).readyState === 'open') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.once('error', fail);
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      socket.removeListener('error', fail);
      resolve();
    });
  });
}

function buildData(input: { fromName: string; fromAddress: string; to: string; subject: string; text: string }): string {
  const lines = [
    `From: ${encodeHeader(input.fromName)} <${input.fromAddress}>`,
    `To: <${input.to}>`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'),
  ];
  return lines.join('\r\n');
}

function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]/g, ' ').trim();
  if (!clean) {
    return 'ANEXSYS';
  }
  if (/^[\x20-\x7E]+$/.test(clean)) {
    return clean;
  }
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function assertLine(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} inválido.`);
  }
}

class SmtpDialog {
  private buffer = '';
  private pending: string[] = [];
  private waiter: ((result: { line?: string; error?: Error }) => void) | null = null;
  private closed = false;

  constructor(private readonly socket: net.Socket) {
    socket.setTimeout(TIMEOUT_MS);
    socket.on('data', (chunk: Buffer) => this.push(chunk.toString('utf8')));
    socket.on('error', (error) => this.fail(error));
    socket.on('timeout', () => this.fail(new Error('O servidor de e-mail não respondeu.')));
    socket.on('end', () => {
      this.closed = true;
      this.fail(new Error('O servidor de e-mail encerrou a conexão.'));
    });
  }

  async command(line: string, expected: number): Promise<void> {
    this.socket.write(`${line}\r\n`);
    await this.expect(expected);
  }

  async expect(expected: number): Promise<void> {
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      lines.push(line);
      if (line.length < 4 || line[3] !== '-') {
        const code = Number(line.slice(0, 3));
        if (code !== expected) {
          throw new Error(`O servidor de e-mail recusou: ${lines.join(' ').slice(0, 300)}`);
        }
        return;
      }
    }
  }

  private readLine(): Promise<string> {
    const queued = this.pending.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      this.waiter = (result) => {
        this.waiter = null;
        if (result.error || result.line === undefined) {
          reject(result.error ?? new Error('O servidor de e-mail encerrou a conexão.'));
          return;
        }
        resolve(result.line);
      };
    });
  }

  private push(text: string): void {
    this.buffer += text;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      if (this.waiter) {
        const waiter = this.waiter;
        this.waiter = null;
        waiter({ line });
      } else {
        this.pending.push(line);
      }
      index = this.buffer.indexOf('\n');
    }
  }

  private fail(error: Error): void {
    if (this.closed && this.waiter === null && this.pending.length === 0) {
      return;
    }
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.({ error });
  }
}
