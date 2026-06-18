import GUI from 'lil-gui'

export default class Debug {
  constructor() {
    // GUI racine : chaque composant du World y ajoute son propre dossier
    this.ui = new GUI({ title: 'Réglages' })
  }
}
