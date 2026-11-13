# Mortal Fight

Jogo de luta 3D 1x1 que roda no navegador, feito com [Three.js](https://threejs.org).

## Como jogar

| | Jogador 1 | Jogador 2 |
|---|---|---|
| Andar | A / D | ← / → |
| Defender | S | ↓ |
| Soco | J | 1 (teclado numérico) ou 7 |
| Gancho | U | 2 ou 8 |
| Chute | K | 3 ou 9 |
| Chute alto | I | 4 ou 0 |

P pausa · M liga/desliga o som. No celular aparecem botões na tela.

Melhor de 3 rounds. Golpes seguidos viram combo, e golpes pesados podem derrubar o adversário.

## Rodar no computador

```bash
npm install
npm run dev
```

## Animações

Os arquivos originais do Mixamo ficam em `assets-src/`. Eles são convertidos em um único arquivo
otimizado, `public/models/fighter.glb`. Para adicionar animações novas, coloque o `.fbx` em
`assets-src/`, adicione o nome na lista de `tools/convert.html` e rode:

```bash
npx vite --port 5199 &
node tools/convert.cjs
```

## Estrutura

- `src/main.js`: loop do jogo, rounds, golpes, câmera e efeitos de tela
- `src/fighter.js`: lutador, animações e lista de golpes
- `src/arena.js`: cenário (templo, tochas, portal, céu)
- `src/ai.js`: adversário controlado pelo computador
- `src/particles.js`: fogo, faíscas e sangue
- `src/audio.js`: efeitos sonoros gerados por código
