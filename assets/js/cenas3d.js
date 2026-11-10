/* Cenas 3D da apresentacao "Por tras da agencia".
   Three.js r149 em arquivo local (assets/js/three.min.js): funciona offline e em file://.
   Se o computador nao tiver WebGL, C3.init() devolve false e a apresentacao usa a versao 2D. */
window.C3 = (function () {
  const T = window.THREE;
  const INK = 0x080808, PAPER = 0xF0EDE6, MAG = 0xE8007D, GREY = 0x8C877D, HL = 0xFFD84D;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scenes = {};               // indice do slide -> cena
  let cur = -1, stepNow = 0, scale = 1, last = 0;
  const mouse = { x: 0, y: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  function webgl() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch (e) { return false; }
  }

  /* ---------- base comum: renderer, camera, rotulos HTML projetados ---------- */
  function base(host, fov) {
    const w = host.clientWidth, h = host.clientHeight;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true });
    r.setClearColor(0x000000, 0);
    r.domElement.className = 'c3d';
    host.appendChild(r.domElement);
    const o = { host, r, w, h, scene: new T.Scene(), cam: new T.PerspectiveCamera(fov, w / h, .1, 200), labels: [] };
    o.resize = () => { r.setPixelRatio(clamp((window.devicePixelRatio || 1) * scale, 1, 2)); r.setSize(w, h, false); };
    o.resize();
    return o;
  }
  function label(o, html, cls, anchor) {
    const el = document.createElement('div');
    el.className = 'l3d ' + (cls || '');
    el.innerHTML = html;
    o.host.appendChild(el);
    const L = { el, local: new T.Vector3(), parent: null, dx: 0, dy: 0, show: false, anchor: anchor || 'c' };
    o.labels.push(L);
    return L;
  }
  const _v = new T.Vector3();
  function placeLabels(o) {
    for (const L of o.labels) {
      _v.copy(L.local);
      if (L.parent) { L.parent.updateMatrixWorld(); _v.applyMatrix4(L.parent.matrixWorld); }
      _v.project(o.cam);
      const x = (_v.x + 1) / 2 * o.w + L.dx, y = (1 - _v.y) / 2 * o.h + L.dy;
      const ax = L.anchor === 'l' ? '0%' : L.anchor === 'r' ? '-100%' : '-50%';
      L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(${ax},-50%)`;
      L.el.classList.toggle('on', L.show);
    }
  }
  function dotTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
    return new T.CanvasTexture(c);
  }
  function line(points, mat) {
    const g = new T.BufferGeometry().setFromPoints(points);
    const l = new T.Line(g, mat);
    if (mat.isLineDashedMaterial) l.computeLineDistances();
    return l;
  }

  /* =====================================================================
     1) Tres esferas de pontos: "o que diz", "o que prova", "o que o mercado percebe".
        Abertura: se formam a partir de uma nuvem. Fecho: se fundem no pingo magenta.
     ===================================================================== */
  function orbs(host, opt) {
    const o = base(host, opt.fov || 30);
    o.cam.position.set(0, 0, opt.dist); o.cam.lookAt(0, 0, 0);
    const group = new T.Group(); o.scene.add(group);
    const tex = dotTexture(), N = opt.N || 620, R = opt.radius, cP = new T.Color(opt.color != null ? opt.color : PAPER), cM = new T.Color(MAG);
    const ga = Math.PI * (3 - Math.sqrt(5));
    const sph = (opt.centers || [-opt.gap, 0, opt.gap]).map((cx, i) => {
      const dirs = new Float32Array(N * 3), scat = new Float32Array(N * 3), pos = new Float32Array(N * 3);
      for (let j = 0; j < N; j++) {
        const y = 1 - (j / (N - 1)) * 2, rr = Math.sqrt(1 - y * y), th = ga * j;
        dirs[j * 3] = Math.cos(th) * rr; dirs[j * 3 + 1] = y; dirs[j * 3 + 2] = Math.sin(th) * rr;
        scat[j * 3] = (Math.random() - .5) * (opt.gap || R * 2) * 4.2; scat[j * 3 + 1] = (Math.random() - .5) * R * 5; scat[j * 3 + 2] = (Math.random() - .5) * 8;
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      const m = new T.PointsMaterial({ size: opt.dot, map: tex, transparent: true, alphaTest: .3, depthWrite: false, color: cP.getHex() });
      group.add(new T.Points(g, m));
      const L = opt.names ? label(o, opt.names[i], 'orb-l') : null; if (L) L.parent = group;
      return { g, m, dirs, scat, pos, cx, rot: i * 1.7, spd: .14 + .05 * i, L };
    });
    const core = new T.Mesh(new T.SphereGeometry(1, 48, 32), new T.MeshBasicMaterial({ color: MAG }));
    core.scale.setScalar(.001); group.add(core);
    let a = 0, mg = 0;
    o.tick = (dt) => {
      const vis = stepNow >= opt.showStep ? 1 : 0;
      const mt = opt.mergeStep != null && stepNow >= opt.mergeStep ? 1 : 0;
      a = reduce ? vis : damp(a, vis, 2.0, dt);
      mg = reduce ? mt : damp(mg, mt, 1.7, dt);
      const e = ease(clamp(mg, 0, 1));
      for (const s of sph) {
        if (!reduce) s.rot += dt * s.spd;
        const cx = s.cx * (1 - e), r = R * (1 - .5 * e), cs = Math.cos(s.rot), sn = Math.sin(s.rot);
        for (let j = 0; j < N; j++) {
          const dx = s.dirs[j * 3], dy = s.dirs[j * 3 + 1], dz = s.dirs[j * 3 + 2];
          const x = (dx * cs + dz * sn) * r + cx, y = dy * r, z = (-dx * sn + dz * cs) * r;
          s.pos[j * 3] = lerp(s.scat[j * 3], x, a); s.pos[j * 3 + 1] = lerp(s.scat[j * 3 + 1], y, a); s.pos[j * 3 + 2] = lerp(s.scat[j * 3 + 2], z, a);
        }
        s.g.attributes.position.needsUpdate = true;
        s.m.color.copy(cP).lerp(cM, e);
        s.m.opacity = a * (1 - clamp((e - .55) / .4, 0, 1));
        if (s.L) { s.L.local.set(cx, -R - opt.labelGap, 0); s.L.show = a > .7 && e < .15; }
      }
      core.scale.setScalar(Math.max(.001, opt.core ? R * opt.core * a : R * .42 * ease(clamp((e - .45) / .55, 0, 1))));
      const px = opt.parallax != null ? opt.parallax : 1;
      group.rotation.y = damp(group.rotation.y, mouse.x * .22 * px, 3, dt);
      group.rotation.x = damp(group.rotation.x, mouse.y * .1 * px, 3, dt);
      placeLabels(o);
      o.r.render(o.scene, o.cam);
    };
    return o;
  }

  /* =====================================================================
     2) Mapa de posicionamento em 3D.
        Plano = mapa perceptual (eixos do Bedendo). Altura = pontos no Colibri 2026 (dado verificado).
        Etapas: 1 eixos, 2 concorrentes, 3 TIPZ declarado, 4 TIPZ evidencia + seta, 5 camera gira e as colunas sobem.
     ===================================================================== */
  function map3d(host, cfg) {
    const S = Object.assign({ axes: 1, comp: 2, dec: 3, ev: 4, tall: 5 }, cfg.steps || {});
    const o = base(host, 34);
    const world = new T.Group(); o.scene.add(world);
    o.scene.add(new T.AmbientLight(0xffffff, .72));
    const dl = new T.DirectionalLight(0xffffff, .7); dl.position.set(4, 10, 6); o.scene.add(dl);
    const P = (vx, vy, y) => new T.Vector3(-5 + 10 * vx, y || 0, 3.5 - 7 * vy);
    const H = pts => pts / 144 * 3.1;

    const plane = new T.Mesh(new T.PlaneGeometry(10, 7), new T.MeshBasicMaterial({ color: PAPER, transparent: true, opacity: .05, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; world.add(plane);
    const edge = new T.LineBasicMaterial({ color: PAPER, transparent: true, opacity: .28 });
    const grid = new T.LineBasicMaterial({ color: PAPER, transparent: true, opacity: .07 });
    [[P(0, 0), P(1, 0)], [P(1, 0), P(1, 1)], [P(1, 1), P(0, 1)], [P(0, 1), P(0, 0)], [P(.5, 0), P(.5, 1)], [P(0, .5), P(1, .5)]].forEach(s => world.add(line(s, edge)));
    for (let k = 1; k < 10; k++) if (k !== 5) world.add(line([P(k / 10, 0), P(k / 10, 1)], grid));
    for (let k = 1; k < 8; k++) if (k !== 4) world.add(line([P(0, k / 8), P(1, k / 8)], grid));

    const axl = (txt, v, anchor) => { const L = label(o, txt, 'ax', anchor); L.local.copy(v); L.parent = world; return L; };
    const AX = [axl('← promete criatividade e prêmio', P(0, -.07), 'l'), axl('promete resultado de negócio →', P(1, -.07), 'r'),
                axl('fora do país', P(-.025, 1), 'r'), axl('só no ES', P(-.025, 0), 'r')];

    const items = [
      { name: 'MP <span>(líder)</span>', pts: 144, ev: [.22, .30], col: GREY, step: S.comp, left: true },
      { name: 'Conteúdo', pts: 81, ev: [.80, .16], col: GREY, step: S.comp },
      { name: 'Prósper', pts: 74, ev: [.78, .58], dec: [.86, .95], col: GREY, step: S.comp, decStep: S.comp },
      { name: 'TIPZ, o que entrega', sub: 'clientes do ES + feira em Verona', pts: 122, ev: [.40, .52], dec: [.42, .92], col: MAG, step: S.ev, decStep: S.dec,
        decName: 'TIPZ, o que diz', decSub: '"Brasil, Itália, EUA, México"', me: true }
    ];
    const cyl = new T.CylinderGeometry(.2, .2, 1, 32); cyl.translate(0, .5, 0);
    const ball = new T.SphereGeometry(.27, 32, 20);
    const ring = new T.RingGeometry(.3, .42, 48);

    function arrow(from, to, col, step) {
      const dir = new T.Vector3().subVectors(to, from); const len = dir.length(); dir.normalize();
      const a = from.clone().addScaledVector(dir, .48), b = to.clone().addScaledVector(dir, -.55);
      const pts = []; for (let i = 0; i <= 60; i++) pts.push(a.clone().lerp(b, i / 60).setY(.02));
      const l = line(pts, new T.LineDashedMaterial({ color: col, dashSize: .2, gapSize: .14, transparent: true }));
      const head = new T.Mesh(new T.ConeGeometry(.17, .42, 20), new T.MeshBasicMaterial({ color: col, transparent: true }));
      head.position.copy(b).setY(.02); head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      world.add(l); world.add(head);
      return { l, head, p: 0, step, len };
    }

    const objs = items.map(it => {
      const base = P(it.ev[0], it.ev[1]);
      const mat = new T.MeshLambertMaterial({ color: it.col, transparent: true });
      const c = new T.Mesh(cyl, mat); c.position.copy(base); c.scale.set(1, .001, 1);
      const b = new T.Mesh(ball, mat); b.position.copy(base);
      world.add(c); world.add(b);
      const L = label(o, `<b>${it.name}</b>${it.sub ? `<i>${it.sub}</i>` : ''}<em>${it.pts} pontos no Colibri</em>`, 'pin' + (it.me ? ' me' : '') + (it.left ? ' rt' : ''), it.left ? 'r' : 'l');
      L.parent = world; L.dx = it.left ? -26 : 26;
      const r = { it, c, b, mat, L, base, h: 0, a: 0 };
      if (it.dec) {
        const dp = P(it.dec[0], it.dec[1], .02);
        const rm = new T.Mesh(ring, new T.MeshBasicMaterial({ color: it.col, side: T.DoubleSide, transparent: true }));
        rm.rotation.x = -Math.PI / 2; rm.position.copy(dp); world.add(rm);
        r.ring = rm; r.ra = 0;
        r.arrow = arrow(dp, base, it.col, it.me ? S.ev : S.comp);
        if (it.decName) { const D = label(o, `<b>${it.decName}</b><i>${it.decSub}</i>`, 'pin me', 'r'); D.parent = world; D.local.copy(dp); D.dx = -30; r.D = D; }
      }
      return r;
    });

    // camadas opcionais (visita e formulario)
    const extra = [];
    if (cfg.camadas && cfg.camadas.agencia && cfg.layer.agencia) {
      const A = cfg.camadas.agencia, s = cfg.layer.agencia, hp = P(A.hoje[0], A.hoje[1]);
      const m = new T.Mesh(new T.BoxGeometry(.42, .42, .42), new T.MeshLambertMaterial({ color: HL, transparent: true }));
      m.position.copy(hp).setY(.21); world.add(m);
      const L = label(o, '<b>TIPZ hoje, segundo a TIPZ</b><i>folha B da visita</i>', 'pin hl', 'l'); L.parent = world; L.local.copy(hp); L.dx = 26;
      const ar = A.quer ? arrow(hp, P(A.quer[0], A.quer[1]), HL, s) : null;
      extra.push({ m, L, s, ar, a: 0 });
    }
    if (cfg.camadas && cfg.camadas.turma && cfg.layer.turma) {
      const U = cfg.camadas.turma, s = cfg.layer.turma, tp = P(U.pos[0], U.pos[1], .03);
      const m = new T.Mesh(ring, new T.MeshBasicMaterial({ color: PAPER, side: T.DoubleSide, transparent: true }));
      m.rotation.x = -Math.PI / 2; m.position.copy(tp); world.add(m);
      const L = label(o, `<b>TIPZ, segundo a turma</b><i>média de ${U.n} respostas</i>`, 'pin', 'l'); L.parent = world; L.local.copy(tp); L.dx = 26;
      extra.push({ m, L, s, a: 0 });
    }

    // camera: vista de cima (parece o mapa 2D) -> vista em perspectiva
    const camTop = new T.Vector3(0, 15.2, 3.4), tgtTop = new T.Vector3(0, 0, -.05);
    const camObl = new T.Vector3(8.3, 7.5, 11.1), tgtObl = new T.Vector3(-.2, 1.0, -.3);
    const tgt = new T.Vector3();
    let v = 0, yaw = 0, yawT = 0, dragged = false, drag = null;
    host.addEventListener('pointerdown', e => { drag = { x: e.clientX, y0: yawT }; try { host.setPointerCapture(e.pointerId); } catch (_) {} });
    host.addEventListener('pointermove', e => { if (drag) { yawT = clamp(drag.y0 + (e.clientX - drag.x) * .0035 / Math.max(scale, .3), -1.0, 1.0); dragged = true; } });
    const up = () => { drag = null; };
    host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
    host.addEventListener('dblclick', () => { yawT = 0; dragged = false; });

    o.tick = (dt, t) => {
      const tall = stepNow >= S.tall ? 1 : 0;
      v = reduce ? tall : damp(v, tall, 1.5, dt);
      const e = ease(clamp(v, 0, 1));
      o.cam.position.lerpVectors(camTop, camObl, e);
      tgt.lerpVectors(tgtTop, tgtObl, e); o.cam.lookAt(tgt);
      yaw = damp(yaw, yawT + (!dragged && !reduce ? .14 * Math.sin(t * .35) * e : 0), 4, dt);
      world.rotation.y = yaw;
      AX.forEach(L => (L.show = stepNow >= S.axes && stepNow < S.tall));
      for (const r of objs) {
        const on = stepNow >= r.it.step ? 1 : 0;
        r.a = reduce ? on : damp(r.a, on, 5, dt);
        r.h = reduce ? H(r.it.pts) * tall : damp(r.h, H(r.it.pts) * tall, 2.2, dt);
        r.mat.opacity = r.a; r.c.visible = r.b.visible = r.a > .02;
        r.b.scale.setScalar(Math.max(.001, r.a));
        r.c.scale.set(1, Math.max(.001, r.h), 1);
        r.b.position.y = r.h;
        r.L.local.set(r.base.x, r.h, r.base.z);
        r.L.show = r.a > .5;
        r.L.el.classList.toggle('h', stepNow >= S.tall);
        if (r.ring) {
          const ron = stepNow >= r.it.decStep ? 1 : 0;
          r.ra = reduce ? ron : damp(r.ra, ron, 5, dt);
          r.ring.material.opacity = r.ra; r.ring.scale.setScalar(Math.max(.001, r.ra)); r.ring.visible = r.ra > .02;
          if (r.D) r.D.show = r.ra > .5 && stepNow < S.tall;
          const A = r.arrow, aon = stepNow >= A.step ? 1 : 0;
          A.p = reduce ? aon : damp(A.p, aon, 2.4, dt);
          A.l.geometry.setDrawRange(0, Math.round(61 * A.p));
          A.head.material.opacity = clamp((A.p - .85) / .15, 0, 1); A.head.visible = A.head.material.opacity > .02; A.l.visible = A.p > .02;
        }
      }
      for (const x of extra) {
        const on = stepNow >= x.s ? 1 : 0; x.a = reduce ? on : damp(x.a, on, 5, dt);
        x.m.material.opacity = x.a; x.m.scale.setScalar(Math.max(.001, x.a)); x.m.visible = x.a > .02; x.L.show = x.a > .5;
        if (x.ar) { x.ar.p = x.a; x.ar.l.geometry.setDrawRange(0, Math.round(61 * x.a)); x.ar.head.material.opacity = clamp((x.a - .85) / .15, 0, 1); x.ar.head.visible = x.ar.l.visible = x.a > .02; }
      }
      placeLabels(o);
      o.r.render(o.scene, o.cam);
    };
    return o;
  }

  /* =====================================================================
     3) Parede de premios: 19 selos como o site mostra; no clique, cada um vira
        e voa para a pilha do que a checagem encontrou.
     ===================================================================== */
  const WALL = [
    { key: 'c1', title: 'Confirmados como da TIPZ, 2025 e 2026', cols: 1, items: [
      ['Festival Colibri', '32x', 'Colibri', '2025 e 2026'], ['WINA', '2x', 'WINA', 'prata e bronze, 2026'], ["A' Design", '3x', "A' Design", '2 de 3, em 2026']] },
    { key: 'c2', title: 'Trabalhos anteriores da equipe, em outras empresas', cols: 2, items: [
      ['Cannes Lions', 'finalista em filme', 'Cannes Lions', 'Avalanche, 2017'], ['Cannes ACT', '1x', 'Cannes ACT', 'Avalanche, 2018'], ['El Ojo', '1x', 'El Ojo', 'Avalanche, 2016'],
      ["Lürzer's Archive", '200 best', "Lürzer's Archive", 'Origens, 2018'], ['Paris Design', '1x', 'Paris Design', 'Montenegro Design'], ['IDA', '1x', 'IDA', 'Montenegro, 2021'], ['Lusófonos', '2x', 'Lusófonos', 'Montenegro, 2024']] },
    { key: 'c3', title: 'Publicação, não prêmio', cols: 1, items: [['Anuário Clube de Criação', 'selecionado', 'Clube de Criação', 'acervo, 2025']] },
    { key: 'c4', title: 'Não confirmados ou não verificáveis', cols: 2, items: [
      ['FePI', '6x', 'FePI', 'não confirmado'], ['LEAG', 'agência do ano', 'LEAG', 'não confirmado'], ['Bornancini', '1x', 'Bornancini', 'não confirmado'],
      ['Renato Castelo Branco', '1x', 'Renato C. Branco', 'não confirmado'], ['Favourite', '1x', 'Favourite', 'não confirmado'],
      ['Davey', '2x', 'Davey', 'não verificável'], ['Communicator', '1x', 'Communicator', 'não verificável'], ['W3', '1x', 'W3', 'não verificável']] }
  ];
  const STY = {
    front: { bg: '#FFFFFF', fg: '#080808', sub: '#625E56', bd: '#D9D4CA', bw: 4 },
    c1: { bg: '#080808', fg: '#F0EDE6', sub: '#BDB8AD', bd: '#080808', bw: 0 },
    c2: { bg: '#FFFFFF', fg: '#080808', sub: '#625E56', bd: '#080808', bw: 7 },
    c3: { bg: '#FFFFFF', fg: '#080808', sub: '#625E56', bd: '#625E56', bw: 6, dash: true },
    c4: { bg: '#F0EDE6', fg: '#625E56', sub: '#8C877D', bd: '#8C877D', bw: 6, dash: true }
  };
  function tileTex(l1, l2, st) {
    const S = STY[st], c = document.createElement('canvas'); c.width = 512; c.height = 168;
    const g = c.getContext('2d');
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.fillStyle = S.bg; rr(4, 4, 504, 160, 22); g.fill();
    if (S.bw) { g.lineWidth = S.bw; g.strokeStyle = S.bd; g.setLineDash(S.dash ? [16, 12] : []); rr(4 + S.bw / 2, 4 + S.bw / 2, 504 - S.bw, 160 - S.bw, 20); g.stroke(); g.setLineDash([]); }
    let f = 50; g.font = `700 ${f}px 'Inter Tight', Inter, sans-serif`;
    while (g.measureText(l1).width > 452 && f > 26) { f -= 2; g.font = `700 ${f}px 'Inter Tight', Inter, sans-serif`; }
    g.fillStyle = S.fg; g.textBaseline = 'alphabetic'; g.fillText(l1, 30, 80);
    g.font = `500 34px 'JetBrains Mono', Consolas, monospace`; g.fillStyle = S.sub; g.fillText(l2, 30, 134);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  function wall3d(host, opt) {
    const o = base(host, 30);
    o.cam.position.set(0, -.2, 13.2); o.cam.lookAt(0, -.2, 0);
    const TW = 2.4, TH = .8, CW = 2.6, RH = .96, GAP = .6;
    const geo = new T.BoxGeometry(TW, TH, .07);
    const side = new T.MeshBasicMaterial({ color: 0xD9D4CA });
    // posicoes finais (pilhas)
    let totalCols = 0; WALL.forEach(g => (totalCols += g.cols));
    const width = totalCols * CW + (WALL.length - 1) * GAP;
    let x0 = -width / 2 + CW / 2;
    const tiles = [], heads = [];
    WALL.forEach(gr => {
      const rows = Math.ceil(gr.items.length / gr.cols);
      gr.items.forEach((it, k) => {
        const col = k % gr.cols, row = Math.floor(k / gr.cols);
        tiles.push({ it, key: gr.key, dst: new T.Vector3(x0 + col * CW, 1.25 - row * RH, 0) });
      });
      const L = label(o, `<b>${gr.items.length}</b><span>${gr.title}</span>`, 'whd ' + gr.key + (gr.cols > 1 ? ' w2' : ''), 'c');
      L.local.set(x0 + (gr.cols - 1) * CW / 2, 1.25 + 1.35, 0);
      heads.push(L);
      x0 += gr.cols * CW + GAP;
      void rows;
    });
    // ordem da parede como o site mostra (embaralhada, fixa)
    const order = [8, 0, 4, 1, 12, 3, 16, 5, 9, 13, 6, 17, 2, 10, 14, 7, 18, 11, 15];
    tiles.forEach((tl, i) => {
      const w = order.indexOf(i), c = w % 5, r = Math.floor(w / 5);
      tl.src = new T.Vector3((c - 2) * CW, 1.0 - r * RH * 1.05 + (r === 3 ? 0 : 0), 0);
      if (r === 3) tl.src.x += CW / 2;
      const mats = [side, side, side, side,
        new T.MeshBasicMaterial({ map: tileTex(tl.it[0], tl.it[1], 'front'), transparent: true, alphaTest: .1 }),
        new T.MeshBasicMaterial({ map: tileTex(tl.it[2], tl.it[3], tl.key), transparent: true, alphaTest: .1 })];
      tl.m = new T.Mesh(geo, mats); tl.m.position.copy(tl.src); tl.m.position.y += 8;
      tl.w = w; o.scene.add(tl.m);
    });
    let ap = 0, sp = 0;
    o.tick = (dt) => {
      const on = stepNow >= opt.showStep ? 1 : 0, so = stepNow >= opt.sortStep ? 1 : 0;
      ap = reduce ? on : clamp(ap + (on ? dt : -dt) / 1.1, 0, 1);
      sp = reduce ? so : clamp(sp + (so ? dt : -dt) / 2.2, 0, 1);
      tiles.forEach((tl, i) => {
        const ea = ease(clamp((ap * 1.1 - tl.w * .025) / .6, 0, 1));
        const es = ease(clamp((sp * 2.2 - i * .055) / 1.1, 0, 1));
        tl.m.position.lerpVectors(tl.src, tl.dst, es);
        tl.m.position.y += (1 - ea) * 8;
        tl.m.position.z = Math.sin(Math.PI * es) * 2.4;
        tl.m.rotation.y = Math.PI * es;
        tl.m.rotation.x = Math.sin(Math.PI * es) * .25 + (1 - ea) * .6;
      });
      heads.forEach(L => (L.show = sp > .92));
      o.scene.rotation.y = damp(o.scene.rotation.y, mouse.x * .08, 3, dt);
      o.scene.rotation.x = damp(o.scene.rotation.x, mouse.y * .05, 3, dt);
      placeLabels(o);
      o.r.render(o.scene, o.cam);
    };
    return o;
  }

  /* ---------- laco de animacao: so a cena do slide atual desenha ---------- */
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
    const s = scenes[cur];
    if (s) s.forEach(o => o.tick(dt, now / 1000));
    requestAnimationFrame(loop);
  }

  return {
    init(cfg) {
      if (!T || !webgl()) return false;
      try {
        // cada cena se liga ao slide que contem o seu elemento
        const at = (id, make) => { const h = document.getElementById(id); if (!h) return; const sl = h.closest('.slide'); const i = [...document.querySelectorAll('.slide')].indexOf(sl); (scenes[i] = scenes[i] || []).push(make(h)); };
        const names = ['o que ela diz', 'o que ela prova', 'o que o mercado percebe'];
        at('globe1', h => orbs(h, { dist: 14, centers: [0], radius: 3.15, dot: .2, N: 1500, core: .16, showStep: 0 }));
        at('orbs5', h => orbs(h, { fov: 8, dist: 53, gap: 15.56, radius: 2.9, dot: 1.9, color: INK, showStep: 0, parallax: .2 }));
        at('orbs10', h => orbs(h, { fov: 16, dist: 26.5, gap: 5.2, radius: 2.0, dot: .83, labelGap: .75, names, showStep: 1, mergeStep: 2 }));
        at('map3d', h => map3d(h, Object.assign({ steps: { axes: 0, comp: 0, dec: 1, ev: 2, tall: 3 } }, cfg)));
        at('wall3d', h => wall3d(h, { showStep: 1, sortStep: 2 }));
        addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });
        requestAnimationFrame(t => { last = t; loop(t); });
        return true;
      } catch (e) { console.warn('3D desligado:', e); return false; }
    },
    update(slide, step) { cur = slide; stepNow = step; },
    setScale(s) { scale = s; Object.values(scenes).forEach(a => a.forEach(o => o.resize())); }
  };
})();
