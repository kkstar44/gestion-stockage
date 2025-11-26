// Edge Function pour envoyer une notification email avec QR Code
// lors de l'ajout d'une nouvelle matière

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Générer le contenu du QR Code (texte avec les détails)
function generateQRContent(material: any, client: any): string {
  const date = new Date().toLocaleDateString('fr-FR');
  const unitPrice = material.unit_price || 0;
  const quantity = material.quantity || 0;
  return `
ALPHA SECURITY - Nouveau depot

Matiere: ${material.material_name || 'N/A'}
Quantite: ${quantity} ${material.unit || ''}
Valeur: ${unitPrice * quantity} EUR
Date: ${date}
Client: ${client.company_name || client.full_name || 'N/A'}
  `.trim();
}

// Générer l'URL du QR Code via API gratuite
function generateQRCodeUrl(content: string): string {
  const encoded = encodeURIComponent(content);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
}

Deno.serve(async (req) => {
  // Vérifier la méthode
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const { material, client } = await req.json();

    if (!material || !client) {
      return new Response(
        JSON.stringify({ error: 'Material and client data required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!client.email) {
      return new Response(
        JSON.stringify({ error: 'Client email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Générer le contenu QR et l'URL
    const qrContent = generateQRContent(material, client);
    const qrCodeUrl = generateQRCodeUrl(qrContent);
    
    const date = new Date().toLocaleDateString('fr-FR');
    const unitPrice = material.unit_price || 0;
    const quantity = material.quantity || 0;
    const totalValue = (unitPrice * quantity).toLocaleString('fr-FR');

    // Envoyer l'email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alpha Security <onboarding@resend.dev>',
        to: [client.email],
        subject: `📦 Nouveau dépôt - ${material.material_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #C41E3A; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Alpha Security</h1>
              <p style="margin: 5px 0 0 0;">Gestion de Stockage Sécurisé</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef;">
              <h2 style="color: #C41E3A; margin-top: 0;">📦 Nouveau dépôt enregistré</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Matière</strong></td>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${material.material_name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Quantité</strong></td>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${quantity} ${material.unit || ''}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Valeur unitaire</strong></td>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${unitPrice.toLocaleString('fr-FR')} €</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Valeur totale</strong></td>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6; color: #C41E3A; font-weight: bold;">${totalValue} €</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><strong>Date de dépôt</strong></td>
                  <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${date}</td>
                </tr>
              </table>
              
              <div style="text-align: center; margin-top: 20px; padding: 20px; background: white; border-radius: 8px;">
                <p style="margin: 0 0 10px 0; color: #666;">Scannez ce QR Code pour voir les détails :</p>
                <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px;">
              </div>
            </div>
            
            <div style="background: #5A5A5A; color: white; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px;">Alpha Security - Escorts & Services</p>
              <p style="margin: 5px 0 0 0; font-size: 12px;">
                <a href="https://kkstar44.github.io/gestion-stockage/" style="color: white;">Accéder à votre espace</a>
              </p>
            </div>
          </div>
        `,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Resend error:', emailResult);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailResult }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully', id: emailResult.id }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});
