# Nosso Dinheiro — economia doméstica

Aplicativo web para organizar as finanças da casa: receitas, despesas, dívidas, cofrinhos e relatórios.
Funciona no celular e no notebook, **sem servidor e sem login**: os dados ficam só no aparelho.

## Como rodar no computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install      # instala as dependências (uma vez)
npm run dev      # abre o app em http://localhost:5173
```

## Testes

```bash
npm test                          # regras e cálculos (dinheiro, datas, feriados, banco de dados, resumo)
npm run build && npm run test:e2e # abre o app num navegador de verdade (celular, tablet e notebook)
```

## Publicar (Netlify, gratuito)

O arquivo `netlify.toml` já tem tudo: comando de build, rotas e as **travas de segurança**
(o app fica proibido de enviar dados para qualquer servidor ou carregar coisas de outros sites).

## Licença

Copyright (c) 2026 Rafaell Tirone. Todos os direitos reservados — veja o arquivo `LICENSE`.

## Organização do código

| Pasta | O que tem |
|---|---|
| `src/tipos` | Formato dos dados (lançamento, categoria…) |
| `src/db` | Banco de dados local (IndexedDB) e categorias padrão |
| `src/utils` | Dinheiro em centavos, datas sem fuso, feriados |
| `src/servicos` | Cálculos (resumo do mês, depois juros, relatórios…) |
| `src/hooks` | Leitura dos dados com atualização automática da tela |
| `src/componentes` | Peças visuais reutilizáveis e a estrutura das telas |
| `src/paginas` | As telas do app |
| `tests` | Testes de ponta a ponta no navegador |

## Regras importantes

- Dinheiro sempre em **centavos inteiros** (R$ 12,34 = 1234) — sem erro de arredondamento.
- Datas sempre como texto `AAAA-MM-DD` — 01/10 nunca vira 30/09 por causa do fuso.
- Guardar dinheiro num cofrinho **não é despesa**.
- Compra parcelada no cartão: cada parcela entra no mês dela.
