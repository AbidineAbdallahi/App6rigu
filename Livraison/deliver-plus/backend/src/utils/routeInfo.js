const http = require('http');

/**
 * Retourne distance (km) + durée (min) via OSRM.
 * Fallback : haversine × 1.3 pour distance, vitesse moyenne 30 km/h pour durée.
 */
function getRouteInfo(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const fallbackKm  = Math.round(straightKm * 1.3 * 10) / 10;
  const fallbackMin = Math.round((fallbackKm / 30) * 60);

  return new Promise((resolve) => {
    try {
      const req = http.get({
        hostname: 'router.project-osrm.org',
        path:     `/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`,
        method:   'GET',
        timeout:  4000,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const route = json.routes?.[0];
            if (!route) return resolve({ distanceKm: fallbackKm, durationMin: fallbackMin });
            const distanceKm  = Math.round(route.distance / 100) / 10;
            const durationMin = Math.max(1, Math.round(route.duration / 60));
            resolve({ distanceKm, durationMin });
          } catch { resolve({ distanceKm: fallbackKm, durationMin: fallbackMin }); }
        });
      });
      req.on('error',   () => resolve({ distanceKm: fallbackKm, durationMin: fallbackMin }));
      req.on('timeout', () => { req.destroy(); resolve({ distanceKm: fallbackKm, durationMin: fallbackMin }); });
    } catch { resolve({ distanceKm: fallbackKm, durationMin: fallbackMin }); }
  });
}

module.exports = { getRouteInfo };
