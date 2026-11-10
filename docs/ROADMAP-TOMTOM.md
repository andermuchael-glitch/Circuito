# Circuito — evolução gradual com TomTom

## Regras de segurança da evolução

- Preservar o mapa, a navegação, as comandas, o GPS, o compartilhamento e o painel de quilômetros existentes.
- Não remover o fallback OpenStreetMap/OSRM.
- Manter as chaves de API somente em GitHub Secrets e variáveis de build; nunca gravar tokens no código.
- Entregar um recurso por etapa, validar build e testar no celular antes de iniciar a etapa seguinte.
- Não registrar quilometragem estimada como quilometragem realmente percorrida.

## Levantamento do estado atual

- Busca de endereços: TomTom Geocoding já é o provedor primário em `src/lib/places.ts`, com fallback para Nominatim e Photon.
- Roteamento: `src/lib/routing.ts` já consulta TomTom Routing e mantém OSRM como fallback.
- Otimização inicial: `optimizeOrder` em `src/lib/geo.ts` usa proximidade em linha reta (vizinho mais próximo); ainda não é otimização viária baseada em tempo de trânsito.
- ETA: o retorno de rota já contém duração estimada; o compartilhamento permanente já publica `eta_seconds`. Falta apresentar ETA de forma consistente na tela principal de rota.
- Quilometragem: corridas guardam trilha GPS e km percorridos; o painel apresenta totais por período.
- Pontos de interesse e Snap to Roads: ainda não foram integrados como recursos de produto.

## Etapas propostas

1. Busca inteligente: validar e melhorar a experiência TomTom Geocoding já existente, mantendo os provedores de reserva e a confirmação manual do endereço.
2. Trânsito ao vivo: solicitar cálculo de rota com tráfego (`traffic=true`), verificar a resposta e comparar com a rota sem tráfego. A primeira ativação foi aplicada em `src/lib/routing.ts`.
3. ETA na tela: propagar duração e horário estimado de chegada para o estado da rota e mostrar estimativa com indicação de que pode variar conforme o trânsito.
4. Otimização de entregas: calcular e comparar ordens candidatas por tempo/distância de rota viária, sem substituir a ordem escolhida pelo usuário sem confirmação.
5. Pontos de interesse: adicionar busca opcional de postos, oficinas e estacionamentos próximos à posição atual.
6. Snap to Roads: testar o serviço de correspondência de trilha com pontos GPS válidos; preservar a trilha original e só usar o resultado corrigido para visualização/análise.
7. Relatórios inteligentes: comparar km GPS real, km estimado de rota e duração; identificar claramente cada métrica e nunca sobrescrever o histórico.

## Critérios para cada etapa

- Build GitHub Pages concluído com sucesso.
- Sem regressões nas comandas, GPS, navegação, compartilhamento e histórico de km.
- Teste em celular Android e navegador desktop.
- Fallback funcional quando a API TomTom estiver indisponível, a chave faltar ou a quota for excedida.
- Revisar limites e custos da conta TomTom antes de aumentar a frequência de chamadas.
