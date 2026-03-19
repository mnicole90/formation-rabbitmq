# QCM -- Session 1 : Introduction a l'IoT et RabbitMQ

Ce QCM comporte **10 questions** pour verifier votre comprehension des concepts vus pendant la session 1. Chaque question propose 4 reponses possibles, une seule est correcte. Cliquez sur "Voir la reponse" pour afficher la correction.

---

### Question 1 : Definition de l'IoT

Quelle est la meilleure definition de l'Internet des Objets (IoT) ?

- A) Un reseau social permettant aux utilisateurs de partager des photos d'objets
- B) Un ensemble d'objets physiques connectes a Internet, capables de collecter et d'envoyer des donnees sans intervention humaine directe
- C) Un logiciel qui permet de controler son ordinateur a distance
- D) Un protocole reseau utilise uniquement par les smartphones

<details>
<summary>Voir la reponse</summary>

**Reponse : B)**

L'IoT designe des objets physiques (capteurs, actionneurs) connectes a Internet qui peuvent collecter, envoyer et parfois recevoir des donnees de maniere autonome.
</details>

---

### Question 2 : Caracteristiques d'un objet connecte

Parmi les elements suivants, lequel n'est PAS une composante essentielle d'un objet connecte ?

- A) Un capteur ou un actionneur
- B) Une connexion reseau (Wi-Fi, Bluetooth, 4G...)
- C) Un ecran tactile
- D) Un logiciel qui traite et transmet les donnees

<details>
<summary>Voir la reponse</summary>

**Reponse : C)**

Un objet connecte repose sur trois composantes : un capteur/actionneur, une connexion reseau et un logiciel. Un ecran tactile n'est pas necessaire -- beaucoup d'objets IoT (comme un capteur de temperature) n'en ont pas.
</details>

---

### Question 3 : Les 4 couches d'un systeme IoT

Dans l'architecture en 4 couches d'un systeme IoT, quel est le role de la couche 3 (Broker / Traitement) ?

- A) Collecter les donnees physiques via des capteurs
- B) Presenter les donnees a l'utilisateur sur un dashboard
- C) Recevoir, trier, router et traiter les messages
- D) Transporter les donnees via Wi-Fi ou Bluetooth

<details>
<summary>Voir la reponse</summary>

**Reponse : C)**

La couche 3 est le coeur du systeme : c'est le broker (comme RabbitMQ) qui recoit tous les messages des capteurs et les redistribue aux bonnes applications. La couche 1 concerne les capteurs, la couche 2 le reseau, et la couche 4 les applications.
</details>

---

### Question 4 : Comparaison MQTT et AMQP

Quel protocole est considere comme le standard de l'IoT grace a sa legerete ?

- A) HTTP
- B) AMQP
- C) MQTT
- D) CoAP

<details>
<summary>Voir la reponse</summary>

**Reponse : C)**

MQTT est le protocole standard de l'IoT. Il a ete concu pour des environnements ou la bande passante est limitee et la connexion instable. Son en-tete minimum est de seulement 2 octets, ce qui le rend tres leger.
</details>

---

### Question 5 : Protocole CoAP

Quelle est la particularite du protocole CoAP par rapport a MQTT et AMQP ?

- A) Il utilise le protocole de transport UDP au lieu de TCP
- B) Il est le plus lourd des trois protocoles
- C) Il est utilise uniquement pour les systemes bancaires
- D) Il fonctionne uniquement en Wi-Fi

<details>
<summary>Voir la reponse</summary>

**Reponse : A)**

CoAP utilise UDP (et non TCP comme MQTT et AMQP), ce qui le rend adapte aux objets tres contraints en memoire et en puissance de calcul. Il fonctionne comme un "mini-HTTP" et convient aux capteurs industriels a faibles ressources.
</details>

---

### Question 6 : Role du Producer

Dans RabbitMQ, qu'est-ce qu'un **Producer** ?

- A) Le composant qui stocke les messages en attente
- B) Le composant qui envoie des messages (par exemple un capteur)
- C) Le composant qui trie les messages selon leur destination
- D) Le composant qui lit et traite les messages

<details>
<summary>Voir la reponse</summary>

**Reponse : B)**

Le Producer est l'expediteur : c'est lui qui cree et envoie les messages. Dans un systeme IoT, un capteur de temperature qui publie ses mesures est un exemple typique de producer.
</details>

---

### Question 7 : Role de l'Exchange

Quel est le role de l'**Exchange** dans RabbitMQ ?

- A) Stocker les messages en attendant qu'un consumer les lise
- B) Envoyer des messages depuis un capteur vers RabbitMQ
- C) Recevoir les messages et les distribuer vers les bonnes queues selon les regles de binding
- D) Confirmer au producer que le message a bien ete recu

<details>
<summary>Voir la reponse</summary>

**Reponse : C)**

L'exchange est le "bureau de tri" de RabbitMQ. Il recoit les messages des producers, examine la routing key, et applique les regles de binding pour router chaque message vers la ou les queues appropriees.
</details>

---

### Question 8 : Role de la Queue

Que se passe-t-il si un consumer est temporairement indisponible et qu'un message arrive dans sa queue ?

- A) Le message est immediatement supprime
- B) Le message est renvoye au producer
- C) Le message est stocke dans la queue et sera delivre quand le consumer sera de nouveau disponible
- D) RabbitMQ arrete de recevoir de nouveaux messages

<details>
<summary>Voir la reponse</summary>

**Reponse : C)**

C'est un des grands avantages d'un message broker : la queue stocke les messages en attente. Si le consumer n'est pas disponible, rien n'est perdu -- les messages patientent dans la queue et seront delivres plus tard.
</details>

---

### Question 9 : Analogie bureau de poste -- l'Exchange

Dans l'analogie du bureau de poste, a quoi correspond l'**Exchange** de RabbitMQ ?

- A) La boite aux lettres du destinataire
- B) Le bureau de tri qui decide dans quelle boite aux lettres placer chaque lettre
- C) Le facteur qui distribue le courrier
- D) L'expediteur qui ecrit la lettre

<details>
<summary>Voir la reponse</summary>

**Reponse : B)**

L'exchange est compare au bureau de tri postal. Tout comme le bureau de tri examine l'adresse sur l'enveloppe (routing key) et applique ses regles (bindings) pour diriger le courrier vers la bonne boite aux lettres (queue), l'exchange fait de meme avec les messages.
</details>

---

### Question 10 : Analogie bureau de poste -- la Routing Key

Dans l'analogie du bureau de poste, a quoi correspond la **Routing Key** ?

- A) Le tampon de la poste qui indique la date d'envoi
- B) Le nom du facteur charge de la livraison
- C) L'adresse ecrite sur l'enveloppe
- D) Le contenu de la lettre

<details>
<summary>Voir la reponse</summary>

**Reponse : C)**

La routing key est l'equivalent de l'adresse sur l'enveloppe. C'est elle qui indique au bureau de tri (exchange) ou le message doit aller. Par exemple, `salon.temperature` indique que le message concerne la temperature du salon.
</details>
