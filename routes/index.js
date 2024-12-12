// Contains all endpoints for the API
import express from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

function controllerRouting(app) {
  const router = express.Router();
  app.use('/', router);

  // App Controller

  // should return if Redis is alive and if the DB is alive
  router.get('/status', (request, response) => {
    AppController.getStatus(request, response);
  });

  // should return the number of users and files in DB
  router.get('/stats', (request, response) => {
    AppController.getStats(request, response);
  });

  // User Controller

  // should create a new user in DB
  router.post('/users', (request, response) => {
    UsersController.postNew(request, response);
  });

  // should retrieve the user base on the token used
  router.get('/users/me', (request, response) => {
    UsersController.getMe(request, response);
  });

  // Auth Controller

  // should sign-in the user by generating a new authentication token
  router.get('/connect', (request, response) => {
    AuthController.getConnect(request, response);
  });

  // should sign-out the user based on the token
  router.get('/disconnect', (request, response) => {
    AuthController.getDisconnect(request, response);
  });

  // Files Controller

  // should create a new file in DB and in disk
  router.post('/files', (request, response) => {
    FilesController.postUpload(request, response);
  });

  // should retrieve the file document based on the ID
  router.get('/files/:id', (request, response) => {
    FilesController.getShow(request, response);
  });

  // should retrieve all users file documents for a
  // specific parentId and with pagination
  router.get('/files', (request, response) => {
    FilesController.getIndex(request, response);
  });

  // should set isPublic to true on the file document based on the ID
  router.put('/files/:id/publish', (request, response) => {
    FilesController.putPublish(request, response);
  });

  // should set isPublic to false on the file document based on the ID
  router.put('/files/:id/unpublish', (request, response) => {
    FilesController.putUnpublish(request, response);
  });

  // should return the content of the file document based on the ID
  router.get('/files/:id/data', (request, response) => {
    FilesController.getFile(request, response);
  });
}

export default controllerRouting;
