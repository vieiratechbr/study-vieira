# ◈ Study Vieira — Projeto Modular

Versão organizada por pastas e linguagens.

## Estrutura

```
src/
├── main.jsx                        ← Entry point React
├── App.jsx                         ← App completo (referência)
│
├── db/                             ── BANCO DE DADOS
│   ├── localStorage.js             ← Camada local (dev)
│   ├── supabase.js                 ← Camada Supabase (produção)
│   └── index.js                    ← Interface unificada
│
├── styles/                         ── CSS / TEMAS
│   ├── theme.js                    ← Variáveis dark/light
│   ├── global.css                  ← Reset, layout, animações
│   └── components.css              ← Todos os componentes
│
├── sounds/                         ── SONS
│   └── sfx.js                      ← Engine Web Audio
│
├── lib/                            ── UTILITÁRIOS
│   ├── constants.js                ← Cores, tipos, constantes
│   └── utils.js                    ← Funções helpers
│
├── components/                     ── COMPONENTES REACT
│   ├── ui/                         ← Base: GlassCard, Avatar, Pill, Calendar
│   ├── auth/                       ← AuthPage
│   ├── admin/                      ← AdminPosts (com upload de foto)
│   ├── subjects/                   ← Matérias, Conteúdo, Notas, Provas
│   ├── community/                  ← Comunidade, Perfis, Amigos
│   ├── home/                       ← HomePage + PostsFeed (feed Instagram)
│   └── profile/                    ← Perfil do usuário
│
└── pages/
    ├── NavBar.jsx                  ← Navbar minimalista
    └── AgendaTab.jsx               ← Agenda geral
```
