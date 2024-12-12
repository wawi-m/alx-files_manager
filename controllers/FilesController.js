// module that handles file storage endpoints
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import mime from 'mime-types';
import fs from 'fs';
import { promisify } from 'util';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(request, response) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(request);

      if (!user) {
        return response.status(401).send({
          error: 'Unauthorized',
        });
      }

      const {
        name, type, parentId, isPublic, data,
      } = request.body;

      if (!name) {
        return response.status(400).send({
          error: 'Missing name',
        });
      }

      if (!type || !['folder', 'file', 'image'].includes(type)) {
        return response.status(400).send({
          error: 'Missing type',
        });
      }

      if (!data && type !== 'folder') {
        return response.status(400).send({
          error: 'Missing data',
        });
      }

      if (parentId) {
        const parent = await FilesController.getFileById(parentId);

        if (!parent) {
          return response.status(400).send({
            error: 'Parent not found',
          });
        }

        if (parent.type !== 'folder') {
          return response.status(400).send({
            error: 'Parent is not a folder',
          });
        }
      }

      const newFile = {
        userId: user._id.toString(),
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
      };

      if (type === 'folder') {
        const result = await FilesController.insertFile(newFile);
        const writeResp = {
          id: result.insertedId.toString(),
          ...newFile,
        };
        delete writeResp._id;
        delete writeResp.localPath;
        return response.status(201).send(writeResp);
      }
      const storeFolderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fileName = uuidv4();
      const filePath = path.join(storeFolderPath, fileName);

      newFile.localPath = filePath;
      const decodedData = Buffer.from(data, 'base64');

      const pathExists = await FilesController.pathExists(storeFolderPath);
      if (!pathExists) {
        // await fs.mkdir(storeFolderPath, { recursive: true });
        const mkdirAsync = promisify(fs.mkdir);

        try {
          await mkdirAsync(storeFolderPath, { recursive: true });
        } catch (error) {
          console.error('Error creating directory:', error);
          return response.status(500).send({
            error: 'Internal Server Error',
          });
        }
      }

      fs.writeFile(filePath, decodedData, 'utf-8', (error) => {
        if (error) {
          console.error('Error writing file:', error);
          return response.status(500).send({
            error: 'Internal Server Error',
          });
        }
        return undefined;
      });

      const result = await FilesController.insertFile(newFile);
      const writeResp = {
        id: result.insertedId,
        ...newFile,
      };
      delete writeResp._id;
      delete writeResp.localPath;

      return response.status(201).send(writeResp);
    } catch (error) {
      console.error('Error in postUpload:', error);
      return response.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }

  static async retrieveUserBasedOnToken(request) {
    const authToken = request.header('X-Token') || null;

    if (!authToken) return null;

    const token = `auth_${authToken}`;
    const userId = await redisClient.get(token);

    if (!userId) return null;

    return FilesController.getUserById(userId);
  }

  static async getUserById(userId) {
    const usersCollection = dbClient.client.db().collection('users');
    return usersCollection.findOne({ _id: ObjectId(userId) });
  }

  static async getFileById(fileId) {
    const filesCollection = dbClient.client.db().collection('files');
    return filesCollection.findOne({ _id: ObjectId(fileId) });
  }

  static async insertFile(file) {
    const filesCollection = dbClient.client.db().collection('files');
    return filesCollection.insertOne(file);
  }

  static async pathExists(path) {
    return promisify(fs.access)(path, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
  }

  static async getShow(request, response) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(request);

      if (!user) {
        return response.status(401).send({
          error: 'Unauthorized',
        });
      }

      const fileId = request.params.id;

      if (!fileId) {
        return response.status(400).send({
          error: 'Unauthorized',
        });
      }

      const file = await FilesController.getFileById(fileId);

      if (!file || file.userId.toString() !== user._id.toString()) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      // return response.status(200).send(file);
      const mappedFile = {
        id: file._id.toString(),
        ...file,
        parentId: file.parentId,
      };

      delete mappedFile._id;
      delete mappedFile.localPath;

      return response.status(200).send(mappedFile);
    } catch (error) {
      console.error('Error in getShow:', error);
      return response.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }

  static async getIndex(request, response) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(request);

      if (!user) {
        return response.status(401).send({
          error: 'Unauthorized',
        });
      }

      const parentId = request.query.parentId || 0;
      const page = request.query.page || 0;
      const pageSize = 20;

      const files = await FilesController.getFilesByParentId(
        user._id.toString(), parentId, page, pageSize,
      );

      return response.status(200).send(files);
    } catch (error) {
      console.error('Error in getIndex:', error);
      return response.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }

  static async getFilesByParentId(userId, parentId, page, pageSize) {
    try {
      const filesCollection = dbClient.client.db().collection('files');
      const skip = page * pageSize;
      const query = { userId, parentId: parentId === '0' ? 0 : parentId };
      const files = await filesCollection.find(query).skip(skip).limit(pageSize).toArray();

      const mappedFiles = files.map((file) => {
        const { _id, localPath, ...rest } = file;
        return { id: _id.toString(), ...rest };
      });

      return mappedFiles;
    } catch (error) {
      console.error('Error in getFilesByParentId:', error);
      throw new Error('Internal Server Error');
    }
  }

  static async putPublish(request, response) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(request);

      if (!user) {
        return response.status(401).send({
          error: 'Unauthorized',
        });
      }

      const fileId = request.params.id;

      if (!fileId) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      const file = await FilesController.getFileById(fileId);

      if (!file || file.userId.toString() !== user._id.toString()) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      const updatedFile = await FilesController.updateFilePublishStatus(fileId, true);

      return response.status(200).send(updatedFile);
    } catch (error) {
      console.error('Error in putPublish:', error);
      return response.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }

  static async putUnpublish(request, response) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(request);

      if (!user) {
        return response.status(401).send({
          error: 'Unauthorized',
        });
      }

      const fileId = request.params.id;

      if (!fileId) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      const file = await FilesController.getFileById(fileId);

      if (!file || file.userId.toString() !== user._id.toString()) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      const updatedFile = await FilesController.updateFilePublishStatus(fileId, false);

      return response.status(200).send(updatedFile);
    } catch (error) {
      console.error('Error in putUnpublish:', error);
      return response.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }

  static async updateFilePublishStatus(fileId, isPublic) {
    const filesCollection = dbClient.client.db().collection('files');
    const result = await filesCollection.findOneAndUpdate(
      { _id: ObjectId(fileId) },
      { $set: { isPublic } },
      { returnDocument: 'after' },
    );

    const updatedFile = result.value;

    if (!updatedFile) {
      throw new Error('Failed to update file status');
    }

    const { _id, localPath, ...rest } = updatedFile;

    return { id: _id.toString(), ...rest };
  }

  static async getFile(request, response) {
    try {
      const user = await FilesController.retrieveUserBasedOnToken(request);

      const fileId = request.params.id;

      if (!fileId) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      const file = await FilesController.getFileById(fileId);

      if (!file) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      if (!file.isPublic && (!user || file.userId.toString() !== user._id.toString())) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      if (file.type === 'folder') {
        return response.status(400).send({
          error: "A folder doesn't have content",
        });
      }

      const filePath = file.localPath;

      const pathExists = await FilesController.pathExists(filePath);
      if (!pathExists) {
        return response.status(404).send({
          error: 'Not found',
        });
      }

      const mimeType = mime.lookup(file.name);

      const readFileAsync = promisify(fs.readFile);

      const fileContent = await readFileAsync(filePath, 'utf-8');

      response.setHeader('Content-Type', mimeType);
      return response.status(200).send(fileContent);
    } catch (error) {
      console.error('Error in getFile:', error);
      return response.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }
}

export default FilesController;
