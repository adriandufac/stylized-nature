import GUI from 'lil-gui'

// Tous les dossiers du GUI sont fermés par défaut (y compris ceux créés
// après coup, ex. chargement async de l'eau). On enveloppe addFolder une
// seule fois au lieu d'ajouter .close() partout.
const _addFolder = GUI.prototype.addFolder
GUI.prototype.addFolder = function (...args) {
  return _addFolder.apply(this, args).close()
}

export default class Debug {
  constructor() {
    // GUI racine : chaque composant du World y ajoute son propre dossier
    this.ui = new GUI({ title: 'Réglages' })
  }
}
