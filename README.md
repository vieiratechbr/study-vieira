# ◈ Study Vieira

> Organizador de estudos completo — matérias, agenda, comunidade e muito mais.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-opcional-3ECF8E?logo=supabase&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)

---

## ✨ Funcionalidades

### 📚 Matérias
- Cadastro de matérias com cor, categoria e descrição
- **Conteúdo:** registro de aulas, revisões, exercícios, vídeos e leituras com controle de "feito"
- **Anotações:** bloco de notas por matéria
- **Provas:** agendamento de avaliações com peso, nota e observações
- **Calendário** por matéria com visualização de eventos
- **Timer Pomodoro** integrado por matéria (foco 25 min / pausa curta / pausa longa)
- **Flashcards** com sistema de repetição espaçada (fácil / ok / difícil)

### 📅 Agenda
- Visualização unificada de todos os eventos: provas, trabalhos, aulas, entregas, reuniões e lembretes
- Agrupamento por data com marcador "Hoje"
- Marcação de eventos como concluídos
- Histórico dos últimos 20 eventos passados

### 🏠 Home
- Saudação personalizada com horário
- Resumo das matérias com próxima prova
- Calendário interativo com pontos de eventos
- **Feed de Avisos** estilo Instagram (scroll snap) com posts globais e da comunidade

### 👥 Comunidade
- **Busca de pessoas** em tempo real (nome ou e-mail)
- **Seguir / Deixar de seguir** — amizade mútua automática
- **Comunidades:** escolas, universidades, cursinhos etc.
- **Feed de atividades** dos amigos (o que estudaram, notas)
- Visualização de perfil de outros usuários (matérias visíveis para amigos mútuos)

### 👤 Perfil
- Avatar com recorte circular interativo (drag + zoom)
- Banner personalizável (gradientes predefinidos ou foto própria)
- Bio, idade, gênero e curso
- **Heatmap** de atividade de estudo (estilo GitHub)
- **Médias de notas** por matéria com barra de progresso
- Contadores de matérias, seguindo e seguidores

### ⭐ Painel Admin
- **Avisos globais:** publicação de posts com imagem, texto, categoria e fixar
- **Comunidades:** criação e gerenciamento com posts próprios
- **Usuários:** busca, banimento temporário ou indefinido com motivo
- **Administradores:** promoção e remoção de admins
- **Feedbacks:** visualização e exclusão de mensagens dos usuários

### 📬 Feedback & ☕ Apoio
- Envio de sugestões, relatos de bugs, elogios e mensagens livres
- Integração com Buy Me a Coffee

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|------------|
| UI | React 18 + CSS-in-JS puro |
| Build | Vite 5 |
| Banco (produção) | Supabase (PostgreSQL + Auth + Storage) |
| Banco (dev/offline) | localStorage com cache inteligente |
| Áudio | Web Audio API (sem dependências) |
| Deploy | Vercel |

---

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 18+
- npm

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/study-vieira.git
cd study-vieira

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

O app roda em `http://localhost:5173` e funciona **completamente offline** usando localStorage — sem necessidade de configurar o Supabase.

### Conta admin padrão (modo offline)
```
E-mail: admin@studyvieira.com
Senha:  SV@Admin2025!
```

---

## ☁️ Configurando o Supabase (produção)

O Supabase é **opcional**. Quando as variáveis de ambiente estão presentes, os dados são sincronizados automaticamente entre localStorage e o banco remoto.

### 1. Crie um projeto no [supabase.com](https://supabase.com)

### 2. Execute o schema

Acesse **SQL Editor** no Supabase e execute o arquivo:

```
supabase_schema.sql
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Configure o Storage (para avatars grandes)

No Supabase, crie um bucket público chamado `avatars`.

---

## 📦 Build e Deploy

```bash
# Gerar build de produção
npm run build

# Preview local do build
npm run preview
```

### Deploy na Vercel

1. Importe o repositório na [Vercel](https://vercel.com)
2. Adicione as variáveis de ambiente (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`)
3. Deploy automático a cada push na branch principal

O arquivo `vercel.json` já está configurado para SPA (roteamento client-side).

---

## 🗂️ Estrutura do Projeto

```
src/
├── main.jsx                 ← Entry point React
├── App.jsx                  ← App completo (referência monolítica)
│
├── db/
│   ├── localStorage.js      ← Camada de armazenamento local
│   ├── supabase.js          ← Camada Supabase
│   └── index.js             ← Interface unificada (smart DB)
│
├── styles/
│   ├── theme.js             ← Variáveis dark/light
│   ├── global.css           ← Reset, layout, animações
│   └── components.css       ← Estilos de todos os componentes
│
├── sounds/
│   └── sfx.js               ← Engine de áudio (Web Audio API)
│
├── lib/
│   ├── constants.js         ← Cores, tipos, constantes
│   └── utils.js             ← Funções helpers
│
├── components/
│   ├── ui/                  ← GlassCard, Avatar, Pill, Calendar
│   ├── admin/               ← Painel administrativo
│   ├── home/                ← HomePage + PostsFeed
│   └── subjects/            ← Matérias, Conteúdo, Notas, Provas
│
└── pages/
    └── NavBar.jsx           ← Navegação principal
```

---

## 🎨 Sistema de Design

O app usa um design system próprio baseado em **glassmorphism** com:

- Modo **escuro e claro** com transição suave
- Cards com blur, specular highlight e efeito de tilt 3D
- Malha de gradiente animada no fundo
- Tipografia: [Figtree](https://fonts.google.com/specimen/Figtree)
- Paleta de cores neon para estados e categorias
- Animações de entrada por página (`pageIn`, `slideInRight`, `fu`)

---

## 📱 Mobile

- Navbar se transforma em **menu hambúrguer** com drawer lateral
- **Bottom navigation** para as seções principais
- Mensagem de bloqueio para telas menores que 550px (app mobile em breve)

---

## 🔐 Segurança e Permissões

- Autenticação via Supabase Auth (email/senha) ou localStorage
- Sistema de banimento com prazo e motivo visível ao usuário
- Perfis apenas modificáveis pelo próprio usuário
- Painel admin protegido por e-mail e flag `isAdm`
- Cache local com versionamento (`APP_VERSION`) — limpeza automática a cada deploy

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit suas alterações: `git commit -m 'feat: adiciona minha feature'`
4. Push para a branch: `git push origin feature/minha-feature`
5. Abra um Pull Request

---

## ☕ Apoie o Projeto

Se o Study Vieira te ajudou, considere apoiar o desenvolvimento:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/studyvieira)

---

## 📄 Licença

Este projeto é privado. Todos os direitos reservados.
