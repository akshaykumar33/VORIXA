import { UPGRADES, WEAPONS, upgradeQuote, weaponQuote, type Loadout, type UpgradeId, type WeaponId } from '../rush/Garage';

/**
 * The garage shop: spend coins on upgrades and weapons, and pick what to equip.
 *
 * Every button says exactly what it will do and what it costs, and a refused purchase says how
 * many coins are missing — a greyed-out button with no reason is the most frustrating thing a
 * shop can show.
 */

const CSS = /* css */ `
#rush-hud .garagecard { width: min(760px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow-y: auto; }
#rush-hud .garagecard .bank { font-size: 22px; color: var(--ink); margin: 4px 0 10px; }
#rush-hud .garagecard .bank i { display: inline-block; width: 0.9em; height: 0.9em; border-radius: 50%; background: var(--sun); box-shadow: inset 0 -3px 0 #e0a800, 0 0 0 3px var(--ink); vertical-align: -2px; margin-right: 6px; }
#rush-hud .garagecard h3 { margin: 12px 0 6px; font-weight: 400; font-size: 20px; text-align: left; }
#rush-hud .shop { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
#rush-hud .item-card { background: #fff; border-radius: 16px; padding: 10px 12px; box-shadow: 0 0 0 3px var(--ink); text-align: left; display: flex; flex-direction: column; gap: 6px; }
#rush-hud .item-card b { font-weight: 400; font-size: 18px; }
#rush-hud .item-card p { margin: 0; font-family: system-ui, sans-serif; font-size: 12.5px; letter-spacing: 0; }
#rush-hud .item-card .lv { display: flex; gap: 4px; }
#rush-hud .item-card .lv span { width: 22px; height: 8px; border-radius: 4px; background: #e6dfcc; box-shadow: 0 0 0 2px var(--ink); }
#rush-hud .item-card .lv span.on { background: #3ddc84; }
#rush-hud .item-card .btn { font-size: 15px; padding: 6px 10px; align-self: flex-start; }
#rush-hud .item-card .btn[disabled] { opacity: 0.55; cursor: not-allowed; }
#rush-hud .item-card .why { font-family: system-ui, sans-serif; font-size: 11.5px; color: #8a8599; letter-spacing: 0; }
#rush-hud .item-card.equipped { box-shadow: 0 0 0 4px #3ddc84; }
`;

export class GarageUI {
  private readonly card: HTMLElement;
  public onBuyUpgrade: (id: UpgradeId) => void = () => {};
  public onBuyWeapon: (id: WeaponId) => void = () => {};
  public onEquip: (id: WeaponId) => void = () => {};
  public onClose: () => void = () => {};

  public constructor(hudRoot: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.card = document.createElement('section');
    this.card.className = 'card garagecard';
    this.card.hidden = true;
    this.card.setAttribute('aria-labelledby', 'rush-garage-title');
    hudRoot.appendChild(this.card);
  }

  public get open(): boolean {
    return !this.card.hidden;
  }

  public hide(): void {
    this.card.hidden = true;
    this.card.parentElement?.classList.remove('mapping');
  }

  public show(loadout: Loadout, bank: number): void {
    const upgrades = UPGRADES.map((def) => {
      const level = loadout.upgrades[def.id];
      const quote = upgradeQuote(loadout, def.id, bank);
      const next = level < def.levels.length ? def.levels[level] : 'Fully upgraded';
      return `<div class="item-card">
        <b>${def.name}</b>
        <div class="lv" aria-label="Level ${level} of ${def.levels.length}">${def.levels.map((_, i) => `<span class="${i < level ? 'on' : ''}"></span>`).join('')}</div>
        <p>${level < def.levels.length ? 'Next: ' : ''}${next}</p>
        ${level < def.levels.length
          ? `<button class="btn ${quote.ok ? 'primary' : ''}" type="button" data-upgrade="${def.id}" ${quote.ok ? '' : 'disabled'}>Buy · ${def.costs[level]}</button>
             ${quote.ok ? '' : `<span class="why">${quote.reason}</span>`}`
          : ''}
      </div>`;
    }).join('');

    const weapons = WEAPONS.map((def) => {
      const owned = loadout.owned.includes(def.id);
      const equipped = loadout.equipped === def.id;
      const quote = weaponQuote(loadout, def.id, bank);
      const action = equipped
        ? '<button class="btn" type="button" disabled>Equipped</button>'
        : owned
          ? `<button class="btn primary" type="button" data-equip="${def.id}">Equip</button>`
          : `<button class="btn ${quote.ok ? 'primary' : ''}" type="button" data-weapon="${def.id}" ${quote.ok ? '' : 'disabled'}>Buy · ${def.cost}</button>
             ${quote.ok ? '' : `<span class="why">${quote.reason}</span>`}`;
      return `<div class="item-card ${equipped ? 'equipped' : ''}"><b>${def.name}</b><p>${def.description}</p>${action}</div>`;
    }).join('');

    this.card.innerHTML = `
      <h2 class="logo toon" id="rush-garage-title" style="font-size:clamp(32px,5vw,46px)">GARAGE</h2>
      <div class="bank toon" style="color:#fff"><i></i>${bank.toLocaleString()} coins</div>
      <h3>Weapons</h3><div class="shop">${weapons}</div>
      <h3>Upgrades</h3><div class="shop">${upgrades}</div>
      <div class="actions"><button class="btn close" type="button">Done<kbd>Esc</kbd></button></div>`;
    this.card.hidden = false;
    // Like the map, the shop replaces the title screen rather than sitting on top of it.
    this.card.parentElement?.classList.add('mapping');

    const wire = (el: HTMLElement, action: () => void) => {
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      el.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') e.stopPropagation();
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        action();
      });
    };
    this.card.querySelectorAll<HTMLElement>('[data-upgrade]').forEach((b) => wire(b, () => this.onBuyUpgrade(b.dataset.upgrade as UpgradeId)));
    this.card.querySelectorAll<HTMLElement>('[data-weapon]').forEach((b) => wire(b, () => this.onBuyWeapon(b.dataset.weapon as WeaponId)));
    this.card.querySelectorAll<HTMLElement>('[data-equip]').forEach((b) => wire(b, () => this.onEquip(b.dataset.equip as WeaponId)));
    const close = this.card.querySelector<HTMLElement>('.close');
    if (close) {
      wire(close, () => this.onClose());
      close.focus({ preventScroll: true });
    }
  }
}
