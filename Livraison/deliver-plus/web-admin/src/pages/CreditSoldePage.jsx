import { useState } from 'react';
import api from '../services/api';

const P    = '#534AB7';
const MUTED = '#6b6b67';
const GREEN = '#276749';
const RED   = '#742A2A';

export default function CreditSoldePage() {
  const [phone,   setPhone]   = useState('');
  const [montant, setMontant] = useState('');
  const [motif,   setMotif]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null); // { success, name, phone, newSolde, message }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post('/admin/drivers/credit-by-phone', {
        phone: phone.trim(),
        montant: Number(montant),
        motif: motif.trim() || undefined,
      });
      if (data.success) {
        setResult({ success: true, ...data.driver });
        setPhone('');
        setMontant('');
        setMotif('');
      } else {
        setResult({ success: false, message: data.message });
      }
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Erreur serveur' });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>💰 Recharge manuelle</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
          Créditer le solde d'un livreur après vérification du paiement WhatsApp
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ background: '#fff', borderRadius: 14, border: '.5px solid rgba(0,0,0,0.09)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: MUTED, display: 'block', marginBottom: 6 }}>
              Numéro de téléphone du livreur *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+222 XX XX XX XX"
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: MUTED, display: 'block', marginBottom: 6 }}>
              Montant à créditer (MRU) *
            </label>
            <input
              type="number"
              value={montant}
              onChange={e => setMontant(e.target.value)}
              placeholder="Ex: 500"
              min={1}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: MUTED, display: 'block', marginBottom: 6 }}>
              Motif <span style={{ color: '#aaa', fontWeight: 400 }}>(optionnel)</span>
            </label>
            <input
              type="text"
              value={motif}
              onChange={e => setMotif(e.target.value)}
              placeholder="Ex: Recharge WhatsApp du 11/05"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !phone || !montant}
            style={{
              marginTop: 4, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: loading || !phone || !montant ? '#ddd' : P,
              color: loading || !phone || !montant ? '#aaa' : '#fff',
              fontWeight: 700, fontSize: 14,
              transition: 'background .2s',
            }}
          >
            {loading ? 'Traitement…' : '✅ Créditer le solde'}
          </button>
        </div>
      </form>

      {result && (
        <div style={{
          marginTop: 16, borderRadius: 12, padding: 16,
          background: result.success ? '#F0FFF4' : '#FFF5F5',
          border: `1px solid ${result.success ? '#9AE6B4' : '#FEB2B2'}`,
        }}>
          {result.success ? (
            <>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: GREEN }}>
                ✅ Solde crédité avec succès
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: GREEN }}>
                <strong>{result.name}</strong> ({result.phone})
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: GREEN }}>
                Nouveau solde : <strong>{result.newSolde} MRU</strong>
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#2F855A' }}>
                Le livreur a été notifié automatiquement sur son application.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: RED }}>
              ❌ {result.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #ddd', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', color: '#1a1a18',
};
