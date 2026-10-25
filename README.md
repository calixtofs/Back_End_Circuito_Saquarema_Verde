## MVP BACK-END - CIRCUITO SAQUAREMA-VERDE

## INTEGRANTES DA EQUIPE
  
  - Emanuel Leocadio Ramalho Oliveira
  - Felipe de Sousa Calixto
  - Julia Vitória Neves de Souza
  - Julianne Ferreira Emydio
  - Maria Heloisa Cândido Bento
  - Patrick Silva Brito
  - Vinicius Cosme Souza da Silva

## SITUAÇÃO PROBLEMA
  - CIRCUITO SAQUAREMA VERDE - FALTA DE INFORMAÇÕES SOBRE LOCALIZAÇÃO DE TRILHAS E PONTOS DE ECOTURISMO EM SAQUAREMA.
## TECNOLOGIAS UTILIZADAS
  - HTML5
    Utilizado para estruturar todas as páginas do site, definindo a organização dos elementos como cabeçalho, botões, seções, textos e rodapé.    
  - CSS3
    Responsável pela estilização e aparência visual do sistema, incluindo cores, tamanhos, espaçamentos, disposição dos botões, responsividade e layout geral das páginas.    
  - JAVASCRIPT
    Aplicado para adicionar interatividade e dinamismo ao site, como navegação entre páginas, controle de exibição de elementos, validação de campos e funcionamento da área restrita (dashboard e autenticação).    
  - NODE.JS E SQLITE
    Utilizados para autenticar os administradores no servidor e armazenar as contas em um banco SQLite local.
## EXECUTANDO O MVP
  1- Instale o Node.js 22.13 ou superior.
  2- Abra o terminal na pasta do projeto e execute `npm start`.
  3- Acesse `http://localhost:3000` no navegador. Não abra os arquivos HTML diretamente pelo navegador: o login precisa do servidor.
  4- O banco SQLite `database/administrators.sqlite` será criado automaticamente na primeira inicialização.

## ADMINISTRAÇÃO E BANCO DE DADOS
  - A conta principal inicial é `Admin`, com a senha `saquarema`. A senha é armazenada no SQLite como hash, não em texto simples.
  - Entre com essa conta e, no painel de administração, preencha os seis espaços para criar os outros administradores. As senhas novas devem ter pelo menos 12 caracteres.
  - Apenas a conta principal pode definir, editar ou remover as seis contas adicionais. Remover uma conta também encerra suas sessões ativas.
  - A estrutura do banco está em `database/schema.sql`; o arquivo SQLite é gerado localmente e não deve ser versionado.
## INFORMAÇÕES ADICIONAIS
  - Foram criados 3 protótipos, mvp_1, mvp_2 e mvp_3.
## MVP DEFINIDO 
  - MVP_3 - MAPA INTERATIVO COM PONTOS TURÍSTICOS.
## OBJETIVOS E BENEFÍCIOS DO PRODUTO
  - OBJETIVO: FORNECER INFORMAÇÕES SOBRE TRILHAS E PONTOS DE ECOTURISMO EM SAQUAREMA.
  - BENEFÍCIO: PROMOVER O ECOTURISMO E A EDUCAÇÃO AMBIENTAL.
 ## PÚBLICO ALVO
  - MORADORES DE SAQUAREMA
  - TURISTAS
 ## DORES DO PÚBLICO ALVO
  - FALTA DE INFORMAÇÃO SOBRE LOCALIZAÇÃO DE TRILHAS
  - DIFICULDADE EM ENCONTRAR INFORMAÇÕES SOBRE ECOTURISMO










