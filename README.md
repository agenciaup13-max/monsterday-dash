# MonsterDay · Dashboard de Tráfego

Dashboard estático (GitHub Pages) do funil de tráfego Meta Ads do **MonsterDay**, com
**Leadscore A/B/C/D** cruzado por campanha → conjunto → anúncio.

- **URL:** https://agenciaup13-max.github.io/monsterday-dash/
- **Somente leitura** — nunca altera as planilhas. Publica só agregados.
- **Imposto Meta ×1,1385** incluso em todo investimento e nas métricas.

## Fontes (gviz CSV, compartilhadas por link)
- **Leads** (`extração qualificada`): `13qqUwluHeOrhKQss_ZeVnzAsXvXbcQ-7sRCoX58IWjM` gid 0
- **Queries Meta** (`Queries | Meta Ads | MonsterDay`): `19IHpDHbY21By6pC0JMvJ0BItsE1F3dDx4-98EDqhahw` gid 0

## Leadscore (regras do cliente)
| Sinal | Coluna | Pontos |
|---|---|---|
| Faturamento R$50k+/mês | `qual_seu_faturamento` | +3 |
| Papel operador/expert | `como_voce_atua` | +2 |
| Vive de lançamento (dor central) | `funil_venda` | +2 |
| WhatsApp válido | `telefone` | +1 |
| "Começando / só conhecendo" | `qual_seu_faturamento` | −2 |

**Classificação:** A (Quente) ≥5 · B (Morno) 3–4 · C (Frio) 1–2 · D (Desqualificado) ≤0.
Qualificado = A + B. Ajustável no topo do `build.ps1` (funções `LeadScore`/`Tier`).

## Atribuição lead → anúncio
`utm_campaign` = Campaign Name · `utm_content`/`utm_medium` = Ad Name.
UTMs com macro não resolvida (`{{campaign.name}}`) ou fora das queries caem em `SEM_RASTREIO`.

## Como atualiza (100% nuvem)
`build.ps1 -Mode all` baixa as 2 planilhas, cruza tudo e escreve `data.js` (`window.MDAY`).
O gatilho confiável é **cron-job.org → POST no `workflow_dispatch`** a cada 3h; o
`schedule` do Actions (`23 */3`) fica de backup (best effort).

## Rodar local
```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1 -Mode all
```
