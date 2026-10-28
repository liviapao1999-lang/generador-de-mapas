// Carga el editor (payload gzip+base64 en b64-*.txt)
(async () => {
  try {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const r = await fetch('./b64-' + i + '.txt');
      if (!r.ok) throw new Error('No se pudo cargar b64-' + i + '.txt');
      parts.push(await r.text());
    }
    const bin = Uint8Array.from(atob(parts.join('').replace(/\s/g,'')), c => c.charCodeAt(0));
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bin]).stream().pipeThrough(ds);
    const code = await new Response(stream).text();
    (0, eval)(code);
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend',
      '<div style="position:fixed;inset:0;z-index:9999;background:#111;color:#f88;display:flex;align-items:center;justify-content:center;font:15px system-ui;text-align:center;padding:24px">' +
      'Error cargando el editor.<br><small>' + (e && e.message ? e.message : e) + '</small></div>');
  }
})();
