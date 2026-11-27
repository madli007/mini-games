/* =====================================================================
   BOŽIČNA MIZA »Trije dobri možje« — modul mize za motor (../../pinball/src/engine/)
   Logika (CFG, geometrija, pravila) se naloži tudi v Node (testi, bot, merilec strelov);
   grafika (art.js) se naloži le v brskalniku prek view().
   ===================================================================== */
import { CFG, PAL, SHOTS } from './config.js';
import { buildTable } from './table.js';
import { BozicRules } from './rules.js';

export default {
  id: 'bozic',
  ime: 'Božični pinball',
  CFG, PAL, SHOTS,
  buildTable,
  Rules: BozicRules,
  view: () => import('./view.js'),
  /** dosežki huba po koncu igre (d = podatki gameOver + gameStats) */
  achievements: d => [
    (d.multiballs || 0) >= 1 && { key: 'prvi-multiball', title: 'Darilni multiball', icon: '🎁' },
    (d.superJackpots || 0) >= 1 && { key: 'super-jackpot', title: 'Zvezda na jelki', icon: '⭐' },
    (d.superSkills || 0) >= 1 && { key: 'super-skill', title: 'Kepa v polno', icon: '❄️' },
    (d.maxCombo || 0) >= 5 && { key: 'combo-5', title: 'Combo ×5', icon: '🛷' },
  ].filter(Boolean),
  /** dogodki za naloge (games.json → quests) */
  events: d => [
    { name: 'bozicni-pinball:superjackpot', times: Math.min(100, d.superJackpots || 0) },
    { name: 'bozicni-pinball:multiball', times: Math.min(100, d.multiballs || 0) },
  ],
};
