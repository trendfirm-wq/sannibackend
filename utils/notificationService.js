const { Expo } = require('expo-server-sdk');

const expo = new Expo();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendPushNotification({ tokens = [], title, body, data = {} }) {
  try {
    const messages = [];

    if (!Array.isArray(tokens) || tokens.length === 0) {
      console.log('No push tokens found');
      return;
    }

    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token)) {
        console.log('Invalid Expo push token:', token);
        continue;
      }

      messages.push({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: 'default',
      });
    }

    if (messages.length === 0) {
      console.log('No valid push messages to send');
      return;
    }

    const chunks = expo.chunkPushNotifications(messages);
    const receiptIds = [];

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        console.log('PUSH TICKETS:', tickets);

        for (const ticket of tickets) {
          if (ticket.status === 'ok' && ticket.id) {
            receiptIds.push(ticket.id);
          } else {
            console.error('PUSH TICKET ERROR:', ticket);
          }
        }
      } catch (error) {
        console.error('PUSH SEND ERROR:', error);
      }
    }

    if (receiptIds.length === 0) return;

    await wait(5000);

    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

    for (const chunk of receiptIdChunks) {
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        console.log('PUSH RECEIPTS:', JSON.stringify(receipts, null, 2));

        for (const receiptId in receipts) {
          const receipt = receipts[receiptId];

          if (receipt.status === 'error') {
            console.error('PUSH RECEIPT ERROR:', {
              receiptId,
              message: receipt.message,
              details: receipt.details,
            });
          }
        }
      } catch (error) {
        console.error('PUSH RECEIPT CHECK ERROR:', error);
      }
    }
  } catch (err) {
    console.error('SEND PUSH NOTIFICATION FUNCTION ERROR:', err);
  }
}

module.exports = { sendPushNotification };