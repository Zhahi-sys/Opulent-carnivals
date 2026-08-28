// obj_dmgwriter's Draw — the floating damage number.
//
//     draw_set_halign(fa_right);
//     draw_text_transformed(x + 30, y, damagemessage,
//                           2 - stretch, stretch + kill, 0);
//     draw_set_alpha(1 - kill);
//
// FOUR THINGS, all of which change how it reads:
//
// 1. **fa_RIGHT.** The number's right edge is pinned at `x + 30`, so a 3-digit
//    hit grows LEFTWARD from the same point a 1-digit hit occupies. Numbers
//    from different characters in the same turn stay aligned in a column
//    instead of wandering.
// 2. **The squash.** `stretch` starts at 0.2 and rises 0.4 a frame to a clamp
//    of 1, so the scale runs (1.8, 0.2) -> (1.4, 0.6) -> (1.0, 1.0). Three
//    frames of a wide flat smear snapping to square. Constant scale loses the
//    impact completely.
// 3. **`kill` is in the Y SCALE as well as the alpha** — `stretch + kill` — so
//    the number stretches vertically as it fades rather than just dimming.
// 4. **`damage == 0` draws `spr_battlemsg` frame 0, not a "0".** That is the
//    MISS graphic. A fumbled attack bar reads as MISS, which is the only way
//    the player can tell a zero-accuracy turn from a zero-damage one.
//
// The font is `global.damagefont` — `font_add_sprite_ext(spr_numbersfontbig,
// "0123456789", 20, 0)`, PROPORTIONAL (prop = 20 is truthy), unlike the
// fixed-advance HP font. Already in render/text.js.

import { drawSpriteExt, rgb } from './draw/gm.js';
import { drawSpriteText, measureText, FONTS } from './text.js';
import { dmgColor, TYPE_DEAD, MSG_MAX, TYPE_SWOON, C_LIME } from '../sim/dmgnumbers.js';
import { loadFont, drawText } from './font.js';

/**
 * obj_basicattack — the impact sprite, drawn at the enemy's depth so it lands
 * ON the Knight rather than behind or in front of the arena.
 *
 * The Create's `image_xscale = 2` is the default and a critical overrides it
 * to 2.5, then GROWS 0.1 a frame for its whole three-frame life. So a critical
 * is the same art, bigger, and still expanding when it disappears.
 */
export function drawAttackVfx(ctx, state, sprites) {
  const list = state.attackVfx;
  if (!list || !list.length) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const v of list) {
    const entry = sprites.get(v.sprite);
    if (entry?.frames?.length) {
      const frame = Math.min(Math.floor(v.index), entry.frames.length - 1);
      drawSpriteExt(ctx, entry, frame, v.x, v.y, v.scale, v.scale, 0, null, 1);
    } else {
      const pulse = 1 + Math.sin((v.index ?? 0) * 0.8) * 0.12;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - (v.index ?? 0) / 4);
      ctx.strokeStyle = v.critical ? '#fff36b' : '#ffffff';
      ctx.lineWidth = v.critical ? 4 : 2;
      ctx.beginPath();
      ctx.arc(v.x, v.y, (v.critical ? 28 : 20) * pulse, 0, Math.PI * 2);
      ctx.stroke();
      if (v.critical) {
        ctx.fillStyle = '#fff36b';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRIT!', v.x, v.y - 34);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawDmgNumbers(ctx, state, sprites) {
  const d = state.dmg;
  if (!d) return;
  // obj_dmgwriter only. obj_healwriter is a SEPARATE object with its own
  // lifetime and its own depth, so it is drawn by drawHealWriters from the
  // canvas's own order — over the charbox band, not under it. It used to be
  // called from the bottom of this function, which meant the early return
  // below swallowed it whenever no damage number happened to be on screen.
  if (!d.list.length) return;
  const msg = sprites.get('spr_battlemsg');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const n of d.list) {
    if (n.delaytimer < n.delay) continue;

    const xs = 2 - n.stretch;
    const ys = n.stretch + n.kill;
    const alpha = Math.max(0, 1 - n.kill);
    if (xs <= 0 || ys <= 0 || alpha <= 0) continue;
    const color = dmgColor(n.type);

    // `message` swaps the digits for a graphic:
    //
    //     damage == 0        message 1   frame 0   MISS
    //     type == 4          message 2   frame 1   DOWN, c_red
    //     specialmessage 3   message 3   frame 2   MAX,  c_lime
    //
    // and the Draw applies them in that order — `message = specialmessage`
    // first, then the `damage == 0` and `type == 4` overrides — so a heal
    // that lands 0 shows MISS rather than MAX. Ordering these the other way
    // would put MAX on a heal that did nothing.
    let frame = -1;
    if (n.special === MSG_MAX) frame = 2;
    if (n.damage === 0) frame = 0;
    if (n.type === TYPE_DEAD) frame = 1;
    // AFTER type 4, as the Draw applies them: `if (type == 4) message = 2;`
    // then `if (type == 12) message = 10;` -> FRAME 13, the SWOON graphic.
    if (n.type === TYPE_SWOON) frame = 13;
    if (frame >= 0) {
      if (msg) {
        drawSpriteExt(ctx, msg, frame, n.x + 30, n.y, xs, ys, 0, color, alpha);
      } else {
        const label = n.type === TYPE_SWOON ? 'SWOON'
          : n.type === TYPE_DEAD ? 'DOWN'
            : n.damage === 0 ? 'MISS' : 'MAX';
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = n.type === TYPE_SWOON || n.type === TYPE_DEAD
          ? '#ff0000' : rgb(color);
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.translate(n.x + 30, n.y);
        ctx.scale(xs, ys);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      continue;
    }

    // `draw_text_transformed` scales about the DRAW ORIGIN, and with
    // `fa_right` that origin is the string's right edge. Translating to
    // (x + 30, y) and scaling there reproduces both at once — scaling the
    // glyph positions instead would fan the digits apart as the number
    // squashes.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(n.x + 30, n.y);
    ctx.scale(xs, ys);
    const text = String(n.damage);
    drawSpriteText(ctx, sprites, FONTS.damage, text, 0, 0, {
      halign: 'right', color: rgb(color),
    });
    if (n.critical) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff36b';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRIT!', 0, -22);
      ctx.restore();
    }
    ctx.restore();
    // Nothing reads it, but measuring keeps the font warm in the same cache
    // the HP numbers use — and a zero-width measure is the signal that the
    // damage font failed to load, which is otherwise silent.
    if (measureText(sprites, FONTS.damage, text) === 0) {
      state.counters.missingDamageFont = (state.counters.missingDamageFont ?? 0) + 1;
    }
  }
  ctx.restore();
}

/**
 * obj_healwriter's Draw — the ITEM heal number, over the charbox.
 *
 *     scr_84_set_draw_font("mainbig");
 *     draw_set_color(c_lime);
 *     draw_set_alpha(image_alpha);
 *     draw_text(x, y, "+" + string(healamt));
 *
 * `fnt_mainbig` and a plain `draw_text`, so glyphs advance by their own widths
 * — not the writer's fixed hspace, which is obj_writer's idiom and not this
 * object's. And `image_alpha` starts at 1.5 against a draw_set_alpha that
 * CLAMPS at 1, so it holds solid for five frames before the ten-frame fade.
 */
export function drawHealWriters(ctx, state, sprites) {
  const heals = state.dmg?.heals;
  if (!heals || !heals.length) return;
  const font = loadFont();
  if (!font?.ready) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const h of heals) {
    const alpha = Math.min(1, h.alpha);
    if (alpha <= 0) continue;
    // MAX IS A SPRITE, NOT TEXT. obj_dmgwriter's specialmessage 3 draws
    // `spr_battlemsg` FRAME 2 in c_lime — the game's own MAX graphic, the
    // same one the spell heal path uses. Spelling it out in the battle font
    // was close but not the game's lettering.
    if (h.maxed) {
      const msg = sprites?.get('spr_battlemsg');
      if (msg) {
        // `2 - stretch` by `stretch + kill`, exactly as obj_dmgwriter draws
        // it: wide and flat on the first frame, settling at 1 x 1. It was
        // fixed at 2 x 2 — twice the settled size on both axes.
        const st = h.stretch ?? 1;
        drawSpriteExt(ctx, msg, 2, h.x + 30, h.y, 2 - st, st, 0, C_LIME, alpha);
        continue;
      }
    }
    drawText(ctx, font, `+${h.healamt}`, h.x, h.y, {
      color: 'rgb(0,255,0)', alpha, halign: 'center',
    });
  }
  ctx.restore();
}
