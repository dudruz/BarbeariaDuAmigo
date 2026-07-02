# Correção do timeout no GitHub Pages

O log enviado mostra que o build terminou corretamente. O problema aconteceu depois, no deploy:

- O artifact `github-pages` foi criado com sucesso.
- O arquivo final tinha cerca de 45 KB.
- O GitHub Pages ficou repetindo `Current status: deployment_queued`.
- Depois de 10 minutos, o deploy foi cancelado por timeout.

Isso indica fila/configuração do GitHub Pages, não erro de código do site.

## O que este pacote muda

Foi adicionado um workflow próprio em:

`.github/workflows/deploy-pages.yml`

Ele:

- não usa Jekyll;
- não roda npm install;
- não roda build pesado;
- publica só `index.html`, `assets/`, `admin/` e `.nojekyll`;
- não publica a pasta `supabase/`;
- cancela deploy antigo preso na fila;
- aumenta o tempo de espera do deploy para 20 minutos.

## Como aplicar

1. Apague ou desative workflows antigos de Pages se existirem em `.github/workflows/`.
2. Suba todos os arquivos deste pacote na raiz do repositório.
3. No GitHub, vá em:

`Settings > Pages`

4. Em `Build and deployment`, selecione:

`Source: GitHub Actions`

5. Depois vá em:

`Actions > Deploy DUIM static site to GitHub Pages > Run workflow`

ou faça um novo commit na branch `main`.

## Se ainda ficar em deployment_queued

Vá em:

`Actions`

Cancele todos os workflows antigos que estejam rodando ou presos.

Depois vá em:

`Settings > Environments > github-pages`

Confira se não existe regra de aprovação manual segurando o deploy.

Também confira em:

`Settings > Actions > General`

se as permissões permitem deploy pelo GitHub Actions.
