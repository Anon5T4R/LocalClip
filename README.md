# LocalClip

Histórico de área de transferência **100% local** da suíte Local — copiou,
está no histórico; um clique traz de volta.

## Recursos

**v0.2**
- **Recopiar imagem** com um clique (não só texto)
- **Retenção configurável** (10–5000 itens) nas Configurações

**v0.1**
- **Captura automática** de texto e imagem (poller leve, dedup — recopiar o
  mesmo conteúdo só sobe pro topo)
- **Popup por atalho global**: `Ctrl+Shift+V` mostra/esconde a janela com a
  busca focada
- **Busca** no histórico de texto; **fixados** (não expiram) e excluir por item
- **Re-copiar com um clique** (texto; imagem chega na v0.2) + limpar tudo
- **Privacidade de verdade:** tudo em SQLite local (retenção de 500 itens);
  no Windows, conteúdo marcado com
  `ExcludeClipboardContentFromMonitorProcessing` (LocalKeys e gerenciadores de
  senha marcam) **não é capturado**
- Tema claro/escuro/sistema · UI em **PT/EN/ES**

**Roadmap:** v0.2 = recopiar imagem, snippets salvos, excluir por app/padrão,
limite/retenção configuráveis, cifrar em repouso (XChaCha, padrão LocalKeys) ·
v0.3 = colar sem formatação, maiúsc/minúsc, múltiplos formatos.

## Stack

Tauri 2 + React 19 + Vite + TS; Rust no back (plugin clipboard-manager +
poller, `rusqlite` bundled, `image` pro PNG, `clipboard-win` pra flag de
exclusão). Sem rede.

## Dev

```bash
npm install
npm run tauri dev   # porta 1474
```

## Release

Tag `vX.Y.Z` → GitHub Actions builda NSIS (Windows) + AppImage (Linux) e
publica a Release. Parte da suíte [Local](https://github.com/Anon5T4R).

## Licença

MIT
