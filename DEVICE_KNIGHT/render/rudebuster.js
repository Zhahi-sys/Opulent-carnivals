// obj_rudebuster_anim and obj_rudebuster_bolt.
//
// SUSIE IS HIDDEN while this plays — `with (obj_herosusie) visible = 0` in the
// anim's Create, restored at `t >= 28`. The animation object stands in for
// her at her own depth; it is not an effect layered on top. Drawing both
// gives you two Susies.
//
// The bolt leaves a trail of `scr_afterimage` copies, one per frame, each
// shrinking on the Y axis (`image_yscale -= 0.1`) — so the streak tapers
// behind it rather than fading uniformly. On impact eight bursts fly out on
// 45-degree diagonals and decay at two different rates, 0.75 for the first
// four and 0.8 for the second, which is what stops the explosion looking
// like a single ring.

import { drawSpriteExt, c_white } from './draw/gm.js';

export function drawRudeBuster(ctx, state, sprites) {
  const r = state.rude;
  if (!r) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const anim = sprites.get('spr_susie_rudebuster');
  if (r.anim && anim?.frames.length) {
    // `image_index = t / 2` — the sheet plays at half speed, the same
    // 0.5-per-frame rule obj_heroparent uses everywhere.
    const f = Math.min(Math.floor(r.anim.index), anim.frames.length - 1);
    drawSpriteExt(ctx, anim, f, r.anim.x, r.anim.y, 2, 2, 0, c_white, 1);
  } else if (r.anim) {
    const charge = Math.min(1, r.anim.t / 18);
    const waveColors = ['#f0c9ff', '#d58cff', '#b455f4', '#8426c9'];
    ctx.save();
    ctx.translate(r.anim.x, r.anim.y - 22);
    for (let i = 0; i < 4; i++) {
      const waveAge = r.anim.t - i * 3;
      if (waveAge < 0 || waveAge > 18) continue;
      const progress = Math.min(1, waveAge / 18);
      const radius = 7 + progress * (24 + i * 10);
      ctx.globalAlpha = (1 - progress) * (0.9 - i * 0.1);
      ctx.strokeStyle = waveColors[i];
      ctx.lineWidth = 3 - progress * 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.65;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(-r.anim.x, -r.anim.y + 22);
    ctx.globalAlpha = 0.55 + charge * 0.35;
    ctx.fillStyle = '#9c42dc';
    ctx.shadowColor = '#d58cff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#d39cff';
    ctx.beginPath();
    ctx.arc(r.anim.x, r.anim.y - 28, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7435a8';
    ctx.fillRect(r.anim.x - 18, r.anim.y - 10, 36, 52);
    ctx.fillStyle = '#f4dcff';
    ctx.fillRect(r.anim.x - 24, r.anim.y - 4, 48, 6);
    ctx.restore();
  }

  const b = r.bolt;
  const beam = sprites.get('spr_rudebuster_beam');
  if (!b) {
    ctx.restore();
    return;
  }

  if (!beam?.frames.length) {
    const dx = (b.cx ?? b.x) - b.x;
    const dy = (b.cy ?? b.y) - b.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const head = Math.max(10, 28 - (b.t ?? 0));
    ctx.save();
    ctx.globalAlpha = b.alpha ?? 1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7e22ce';
    ctx.lineWidth = 24;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.cx ?? b.x, b.cy ?? b.y); ctx.stroke();
    ctx.strokeStyle = '#d8a5ff';
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.cx ?? b.x, b.cy ?? b.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.cx ?? b.x, b.cy ?? b.y); ctx.stroke();
    ctx.fillStyle = '#f5d9ff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, head, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(b.x + nx * 22, b.y + ny * 22);
    ctx.lineTo(b.x + dx / length * 40, b.y + dy / length * 40);
    ctx.lineTo(b.x - nx * 22, b.y - ny * 22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (b.explode) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - (b.t ?? 0) / 18);
      ctx.strokeStyle = '#f1c9ff';
      ctx.lineWidth = 4;
      for (const shard of b.bursts ?? []) {
        ctx.beginPath();
        ctx.moveTo(shard.x, shard.y);
        ctx.lineTo(shard.x + Math.cos(shard.angle * Math.PI / 180) * 22,
          shard.y - Math.sin(shard.angle * Math.PI / 180) * 22);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // The trail goes under the bolt.
  for (const a of b.trail) {
    if (a.alpha <= 0 || a.scale <= 0) continue;
    // `image_index = 4` — the afterimages are all one frame of the sheet, not
    // the animating one.
    drawSpriteExt(ctx, beam, Math.min(4, beam.frames.length - 1),
      a.x, a.y, 2, a.scale, a.angle, c_white, Math.max(0, a.alpha));
  }

  if (b.explode === 0) {
    drawSpriteExt(ctx, beam, Math.floor(b.t) % beam.frames.length,
      b.x, b.y, 2, 2, b.direction, c_white, b.alpha);
  } else {
    for (const s of b.bursts ?? []) {
      if (s.scale <= 0.05) continue;
      // X ONLY. The Step decays the bursts with
      //
      //     with (burst[i]) { speed *= 0.75; image_xscale *= 0.8; }
      //
      // and never touches image_yscale, which stays at the 2 they inherit
      // from the bolt. Since each burst is rotated to its own 45 + i*90, the
      // shrinking axis is the beam's LENGTH: they retract as streaks at full
      // thickness. Scaling both axes (what this used to do) shrank them into
      // uniform blobs and lost the shape of the explosion.
      drawSpriteExt(ctx, beam, Math.min(4, beam.frames.length - 1),
        s.x, s.y, s.scale * 2, 2, s.angle, c_white, 1);
    }
  }
  ctx.restore();
}
