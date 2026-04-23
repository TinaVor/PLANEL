const os = require('os');
const requireAdmin = require('./_auth');
const { getStats, getTopPaths } = require('../_monitoring');

module.exports = function adminSystem(req, res) {
  if (!requireAdmin(req, res)) return;
  const mem = process.memoryUsage();
  res.json({
    uptime_sec: Math.round(process.uptime()),
    node: process.version,
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    memory: {
      rss_mb: +(mem.rss / 1024 / 1024).toFixed(1),
      heap_used_mb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      heap_total_mb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
      external_mb: +(mem.external / 1024 / 1024).toFixed(1),
    },
    system: {
      hostname: os.hostname(),
      cpus: os.cpus().length,
      loadavg_1m: +os.loadavg()[0].toFixed(2),
      loadavg_5m: +os.loadavg()[1].toFixed(2),
      loadavg_15m: +os.loadavg()[2].toFixed(2),
      total_mem_mb: +(os.totalmem() / 1024 / 1024).toFixed(0),
      free_mem_mb: +(os.freemem() / 1024 / 1024).toFixed(0),
    },
    requests: getStats(),
    top_paths_1h: getTopPaths(60 * 60_000, 10),
    generated_at: new Date().toISOString(),
  });
};
