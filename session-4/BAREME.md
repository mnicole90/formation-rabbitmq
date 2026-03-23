# Barème du Projet Final — /18 + bonus

## Grille de notation

| Critère | Points | Détail |
|---------|--------|--------|
| **Architecture et choix techniques** | /5 | Exchange(s) approprié(s) et justifié(s) (/2), routing keys cohérentes et bien structurées (/2), schéma clair et complet (/1) |
| **Implémentation fonctionnelle** | /5 | Producer(s) fonctionnel(s) qui simulent les capteurs (/2), consumer(s) fonctionnel(s) qui traitent les messages (/2), pipeline bout en bout opérationnel lors de la démo (/1) |
| **Routing et exchanges** | /3 | Topic exchange correctement configuré (/1), bindings corrects par type de capteur et/ou sévérité (/1), les messages arrivent aux bons consumers (vérifié en démo) (/1) |
| **Sécurité** | /3 | Users RabbitMQ créés (/1), permissions correctes — write-only pour capteurs, read-only pour dashboard (/1), acknowledgement manuel implémenté (/1) |
| **Qualité du code** | /2 | Code lisible et commenté (/1), messages JSON bien structurés avec tous les champs : `sensor`, `value`, `room`, `timestamp`, `severity` (/1) |
| **Bonus** | +2 | Fonctionnalités supplémentaires (voir ci-dessous) |

### Idées de bonus (+2 points max)

- Dashboard web temps réel
- Notifications email simulées
- Historique des alertes (stockage en fichier ou base de données)
- Gestion multi-étages (rez-de-chaussée, étage 1, etc.)
- Dead Letter Queue pour les messages en erreur
- Service de stockage dédié
- 2ème instance de consumer pour du load balancing
- Toute autre fonctionnalité pertinente qui va au-delà du cahier des charges

> La base du barème donne un maximum de **18/20**. Les 2 points bonus récompensent les groupes qui vont au-delà du cahier des charges avec des fonctionnalités pertinentes.

---

## Critères de la démo

Lors de votre démonstration de 5 minutes, les points suivants seront vérifiés :

- [ ] Le système se lance sans erreur
- [ ] Les messages circulent correctement entre les producers et les consumers
- [ ] Une alerte **CRITICAL** est déclenchée et reçue par tous les consumers appropriés
- [ ] Les **permissions** sont démontrées (tentative de lecture avec un user write-only = refus)
