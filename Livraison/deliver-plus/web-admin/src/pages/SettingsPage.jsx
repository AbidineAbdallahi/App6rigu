import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

const P = '#534AB7';
const MUTED = '#6b6b67';

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 26, borderRadius: 13, cursor: 'pointer', transition: 'background .2s',
        background: value ? P : '#ddd', position: 'relative', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </div>
  );
}

function Row({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '.5px solid rgba(0,0,0,0.07)' }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    api.get('/admin/settings')
      .then(r => setSettings(r.data.settings))
      .catch(() => toast.error('Impossible de charger les paramètres'));
  }, []);

  const patch = async (update) => {
    const next = { ...settings, ...update };
    setSettings(next);
    setSaving(true);
    try {
      await api.patch('/admin/settings', update);
      toast.success('Paramètre enregistré');
    } catch {
      toast.error('Erreur de sauvegarde');
      setSettings(settings); // rollback
    } finally { setSaving(false); }
  };

  if (!settings) return <p style={{ color: MUTED, padding: 24 }}>Chargement…</p>;

  const now = new Date();
  const endDate = settings.referralEndDate ? new Date(settings.referralEndDate) : null;
  const isExpired = endDate && now > endDate;

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>⚙️ Paramètres</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>Configuration générale de l'application</p>
        </div>
        {saving && <span style={{ fontSize: 12, color: MUTED }}>Enregistrement…</span>}
      </div>

      {/* ── Section Parrainage ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '.5px solid rgba(0,0,0,0.09)', padding: '4px 20px 8px', marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: P, textTransform: 'uppercase', letterSpacing: 1, margin: '16px 0 4px' }}>
          🎁 Programme de parrainage
        </p>

        <Row
          label="Activer le parrainage"
          sub={settings.referralEnabled
            ? isExpired ? '⚠️ Campagne expirée (date de fin dépassée)' : '✅ Actif — les clients et livreurs peuvent parrainer'
            : '❌ Désactivé — aucun bonus ne sera accordé'}
        >
          <Toggle value={settings.referralEnabled} onChange={v => patch({ referralEnabled: v })} />
        </Row>

        <Row label="Bonus client" sub="MRU crédités au client parrain et au filleul">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min={0} step={50}
              value={settings.referralClientBonus}
              onChange={e => setSettings(s => ({ ...s, referralClientBonus: +e.target.value }))}
              onBlur={e => patch({ referralClientBonus: +e.target.value })}
              style={{ width: 80, padding: '5px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: MUTED }}>MRU</span>
          </div>
        </Row>

        <Row label="Bonus livreur" sub="MRU crédités sur le solde du livreur parrain et du filleul">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min={0} step={50}
              value={settings.referralDriverBonus}
              onChange={e => setSettings(s => ({ ...s, referralDriverBonus: +e.target.value }))}
              onBlur={e => patch({ referralDriverBonus: +e.target.value })}
              style={{ width: 80, padding: '5px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: MUTED }}>MRU</span>
          </div>
        </Row>

        <Row label="Début de campagne" sub="Laisser vide = pas de limite de début">
          <input
            type="date"
            value={settings.referralStartDate ? new Date(settings.referralStartDate).toISOString().slice(0, 10) : ''}
            onChange={e => patch({ referralStartDate: e.target.value || null })}
            style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12 }}
          />
        </Row>

        <Row label="Fin de campagne" sub="Laisser vide = pas de limite de fin">
          <input
            type="date"
            value={settings.referralEndDate ? new Date(settings.referralEndDate).toISOString().slice(0, 10) : ''}
            onChange={e => patch({ referralEndDate: e.target.value || null })}
            style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12,
              ...(isExpired ? { borderColor: '#e53e3e', color: '#e53e3e' } : {}) }}
          />
        </Row>

        {/* Résumé visuel */}
        <div style={{
          margin: '12px 0', padding: 12, borderRadius: 10,
          background: settings.referralEnabled && !isExpired ? '#F0FFF4' : '#FFF5F5',
          border: `1px solid ${settings.referralEnabled && !isExpired ? '#9AE6B4' : '#FEB2B2'}`,
        }}>
          <p style={{ margin: 0, fontSize: 12, color: settings.referralEnabled && !isExpired ? '#276749' : '#742A2A' }}>
            {settings.referralEnabled && !isExpired
              ? `✅ Parrainage actif — ${settings.referralClientBonus} MRU / client, ${settings.referralDriverBonus} MRU / livreur`
              : isExpired
                ? `⚠️ Campagne terminée le ${endDate.toLocaleDateString('fr-FR')} — désactivez ou changez la date`
                : '❌ Parrainage désactivé — aucun bonus ne sera accordé'}
          </p>
        </div>
      </div>
    </div>
  );
}
