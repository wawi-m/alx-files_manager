// module that handles authentication token
/* eslint-disable quote-props */
import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(request, response) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const credentialsBase64 = authHeader.slice('Basic '.length);
      const credentials = Buffer.from(credentialsBase64, 'base64').toString('utf-8');
      const [email, password] = credentials.split(':');

      const user = await dbClient.client.db().collection('users').findOne({ email, password: sha1(password) });
      if (!user) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = uuidv4();
      const key = `auth_${token}`;

      const expirationTimeInSeconds = 86400;
      await redisClient.set(key, user._id.toString(), expirationTimeInSeconds);

      response.status(200).json({ 'token': token });
    } catch (error) {
      console.error('Error in getConnect:', error);
      response.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getDisconnect(request, response) {
    try {
      const { 'x-token': token } = request.headers;

      if (!token) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await redisClient.del(key);
      response.status(204).end();
    } catch (error) {
      console.error('Error in getDisconnect:', error);
      response.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;
