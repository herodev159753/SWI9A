const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { encryptBackup } = require('../src/utils/Encryption');
const { sendStatusReport } = require('../src/services/EmailService');

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled Function: Runs every 24 hours at 02:00 AM.
 * Exports all collections, encrypts data, and stores it in GCS.
 */
exports.scheduledBackup = functions.pubsub.schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const collections = ['users', 'orders', 'products', 'audit_logs'];
      let backupData = {};

      for (const coll of collections) {
        const snapshot = await db.collection(coll).get();
        backupData[coll] = snapshot.docs.map(doc => doc.data());
      }

      // 1. Data stringification
      const rawData = JSON.stringify(backupData);

      // 2. Encryption
      const encryptedData = encryptBackup(rawData);

      // 3. Upload to Cloud Storage
      const bucket = admin.storage().bucket('market-project-backups');
      const filename = `backup_${new Date().toISOString()}.enc`;
      const file = bucket.file(filename);

      await file.save(encryptedData, {
        contentType: 'text/plain',
        metadata: {
          encryption: 'aes-256-cbc'
        }
      });

      // 4. Send Success Report
      await sendStatusReport('SUCCESS', `Backup saved as ${filename}. Total records: ${rawData.length} bytes.`);
      
      return console.log("Scheduled backup completed successfully.");
    } catch (error) {
      console.error("Backup Failed:", error);
      await sendStatusReport('FAIL', error.message);
      return null;
    }
  });
