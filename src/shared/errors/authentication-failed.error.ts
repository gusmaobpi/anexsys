export class AuthenticationFailedError extends Error {
  constructor(message = 'E-mail ou senha inválidos.') {
    super(message);
    this.name = 'AuthenticationFailedError';
  }
}
