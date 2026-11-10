#!/usr/bin/env node
/**
 * Publica a branch atual (homolog) direto na instância AWS Lightsail (hml.atelierizagusmao.com.br):
 * 1. Faz git push origin homolog
 * 2. Conecta via SSH em ubuntu@18.191.157.58
 * 3. Atualiza o repositório, instala pacotes se necessário, roda build do backend/frontend e reinicia o PM2.
 */
const { execFileSync } = require('node:child_process');

const LIGHTSAIL_HOST = process.env.LIGHTSAIL_HOST || 'ubuntu@18.191.157.58';
const LIGHTSAIL_BRANCH = process.env.LIGHTSAIL_BRANCH || 'homolog';

function runLocal(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

const remoteScript = [
  'set -e',
  'cd ~/anexsys-platform',
  `git fetch origin ${LIGHTSAIL_BRANCH}`,
  `git checkout ${LIGHTSAIL_BRANCH}`,
  `git pull --ff-only origin ${LIGHTSAIL_BRANCH}`,
  'npm run build',
  'npm run migration:run:prod',
  'npm run frontend:build',
  'pm2 restart anexsys-homolog --update-env',
  'pm2 restart anexsys-frontend --update-env',
  'pm2 save',
].join(' && ');

runLocal('git', ['push', 'origin', LIGHTSAIL_BRANCH]);
runLocal('ssh', ['-o', 'BatchMode=yes', LIGHTSAIL_HOST, remoteScript]);
console.log('Deploy concluído com sucesso em https://hml.atelierizagusmao.com.br');
