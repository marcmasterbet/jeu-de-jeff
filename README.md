# Speed meeting — parcours de tables sur smartphone

Un seul QR code pour tout le monde. Chaque participant confirme sa présence sur son téléphone
(navigateur, aucune application), puis reçoit son parcours personnel : une table par tour.
Jeff pilote tout depuis une seule page.

## Résultat de l'algorithme (8 tours, tables de 4)

| Participants | Tables | Rencontres différentes / personne | Doublons |
|---|---|---|---|
| 28 | 7 | 24 | 0 |
| 40 | 10 | 24 | 0 |
| 52 | 13 | 24 | 0 |
| 64 | 16 | 24 | 0 |

- 28 est le cas le plus serré (24 rencontres sur 27 possibles) : on part d'une solution exacte
  connue, mélangée au hasard à chaque événement.
- Effectif non multiple de 4 : quelques tables de 5 (reste 1 ou 2) ou une table de 3 (reste 3).
  De 25 à 27 participants : zéro doublon garanti (tables de 4 et de 3).
- Le numéro de table change aussi d'un tour à l'autre autant que possible.

## Mise en ligne (une seule fois, ~10 minutes)

Aucune dépendance : Node.js 18+ suffit.

**Render.com** (le plus simple)
1. Mettre ce dossier dans un dépôt GitHub.
2. Sur render.com : *New → Web Service* → choisir le dépôt.
3. Build command : *(vide)* · Start command : `node server.js`.
4. *Environment* → ajouter `ADMIN_CODE` = un code choisi pour Jeff.
5. L'adresse obtenue (ex. `https://speed-meeting.onrender.com`) est celle du QR code.

> ⚠ Offre gratuite Render : le serveur s'endort après 15 min sans visite et repart à vide
> au réveil. Pendant l'événement les téléphones le gardent éveillé, mais pour être tranquille,
> prenez l'offre payante la moins chère avec un disque (*Disk*, monté par ex. sur `/data`, et
> variable `DATA_DIR=/data`). Même chose sur Railway, Fly.io ou un petit VPS.

Test en local : `ADMIN_CODE=test node server.js` puis http://localhost:3000 et http://localhost:3000/jeff

## Le jour J — mode d'emploi pour Jeff

1. Ouvrir **`/jeff`** sur l'ordinateur relié au vidéoprojecteur, saisir le code.
   *(Avant l'événement : Réglages → Tout effacer si des tests ont été faits.)*
2. **Accueil** : le QR code s'affiche en grand (bouton *Plein écran*). Le compteur de présences
   monte en direct.
3. Quand tout le monde est là : **« Clôturer les inscriptions »**. Les parcours sont calculés
   et apparaissent aussitôt sur tous les téléphones.
4. **« Lancer le tour 1 »**, puis toutes les 15 minutes **« Changement de table »**.
   Le chrono est affiché en grand ; un bip retentit à la fin du temps. Les téléphones
   vibrent et affichent la nouvelle table, avec les noms des voisins de table.

### Imprévus
- **Retardataire** : bouton *Accepter un retardataire* → il scanne le QR → *Mettre à jour les parcours*.
- **Quelqu'un sans téléphone** : onglet *Participants* → *Ajouter* ; son parcours est dans la liste
  et dans l'onglet *Tables*.
- **Quelqu'un part** : *Participants* → *Absent* → *Mettre à jour les parcours*.
  Les tours déjà joués ne bougent jamais ; seuls les suivants sont recalculés, sans doublons.
- **Téléphone fermé ou changé** : il suffit de rescanner et de saisir le même nom.
- **Personne perdue** : onglet *Tables* → qui est assis où, tour par tour.

## Fichiers
- `server.js` — serveur et API (données dans `data.json`)
- `algo.js` — répartition (recherche locale + solution exacte à 28)
- `public/index.html` — page participant · `public/admin.html` — espace Jeff
- `public/qrcode.js` — génération du QR code (qrcode-generator, MIT, Kazuhiko Arase)
