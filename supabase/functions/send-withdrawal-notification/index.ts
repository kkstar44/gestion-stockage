// Edge Function pour envoyer une notification email lors d'une sortie de matière

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Générer le contenu du QR Code pour la sortie
function generateQRContent(material: any, client: any, withdrawalQuantity: number): string {
  const date = new Date().toLocaleDateString('fr-FR');
  const remainingQuantity = (material.quantity || 0) - withdrawalQuantity;
  return `
ALPHA SECURITY
Sortie du ${date}

Matiere: ${material.material_name || 'N/A'}
Type: ${material.material_type || 'N/A'}
Quantite retiree: ${withdrawalQuantity} ${material.unit || ''}
Quantite restante: ${remainingQuantity} ${material.unit || ''}
Emplacement: ${material.storage_location || 'N/A'}
N° Certificat: ${material.certificate_number || 'N/A'}
Client: ${client.company_name || client.full_name || 'N/A'}
  `.trim();
}

// Générer l'URL du QR Code via API gratuite
function generateQRCodeUrl(content: string): string {
  const encoded = encodeURIComponent(content);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
}

Deno.serve(async (req) => {
  // Gérer CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { material, client, withdrawalQuantity } = await req.json();

    if (!client?.email) {
      return new Response(
        JSON.stringify({ error: 'Client email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Générer le contenu QR et l'URL
    const qrContent = generateQRContent(material, client, withdrawalQuantity);
    const qrCodeUrl = generateQRCodeUrl(qrContent);

    // Envoyer l'email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alpha Security <noreply@alpha-rdc.com>',
        to: [client.email],
        subject: `📤 Sortie de stock - ${material.material_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #C41E3A; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Alpha Security</h1>
              <p style="margin: 5px 0 0 0;">Gestion de Stockage Sécurisé</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px; border: 1px solid #e9ecef; text-align: center;">
              <h2 style="color: #C41E3A; margin-top: 0;">📤 Sortie de stock enregistrée</h2>
              
              <p style="color: #333; font-size: 16px; margin-bottom: 25px;">
                Une sortie de stock a été enregistrée sur votre compte.<br>
                Scannez le QR Code ci-dessous pour consulter les détails.
              </p>
              
              <div style="background: white; padding: 25px; border-radius: 12px; display: inline-block; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <img src="${qrCodeUrl}" alt="QR Code" style="width: 200px; height: 200px;">
              </div>
              
              <p style="color: #666; font-size: 13px; margin-top: 20px;">
                Conservez ce QR Code pour vos références.
              </p>
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
      JSON.stringify({ error: 'Internal server error' }),
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
