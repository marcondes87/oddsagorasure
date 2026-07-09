# Surebet Desk

Sistema web local para calcular e monitorar surebets a partir de odds de varias casas.

## Rodar

```powershell
npm start
```

Acesse `http://localhost:3000`.

## Importacao

CSV minimo:

```csv
event,sport,league,market,outcome,bookmaker,odd
Time A x Time B,Futebol,Liga,1X2,Time A,Casa A,2.40
Time A x Time B,Futebol,Liga,1X2,Empate,Casa B,3.80
Time A x Time B,Futebol,Liga,1X2,Time B,Casa C,3.30
```

JSON minimo:

```json
[
  {
    "event": "Time A x Time B",
    "sport": "Futebol",
    "league": "Liga",
    "market": "1X2",
    "outcomes": [
      { "name": "Time A", "bookmaker": "Casa A", "odd": 2.4 },
      { "name": "Empate", "bookmaker": "Casa B", "odd": 3.8 },
      { "name": "Time B", "bookmaker": "Casa C", "odd": 3.3 }
    ]
  }
]
```

## Integracao OddsAgora

O componente publico do site chama `/surebets-ajax/`. No momento o backend tenta essa rota em `/api/refresh-oddsagora`, mas a resposta real pode vir criptografada/compactada pela camada JS do site. A integracao foi isolada em `fetchOddsAgoraSurebets()` para ajustar o decoder sem mexer na interface ou no calculo.
