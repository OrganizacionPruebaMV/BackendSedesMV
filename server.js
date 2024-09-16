const express = require('express');
const mysql = require('mysql2');

const app = express();

const bodyParser = require('body-parser');

const morgan = require('morgan');

//////////////NUEVO//////npm install firebase-admin
////////////npm install node-fetch@2
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
//////////////////


const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);

io.on('connection', (socket) => {
  console.log('Un usuario se ha conectado');

  socket.on('chat message', (msg) => {
    console.log('Mensaje recibido:', msg);
    //io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('Un usuario se ha desconectado');
  });
});



app.use(bodyParser.json());

app.use(morgan('combined')); // Puedes ajustar el formato según tus preferencias


const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: 'root',
  database: 'dbsedes',
});

db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión a la base de datos establecida');
});

//////////////25/09 UPDATE///////////////
const fetch = require('node-fetch');



app.post('/sendmessage', (req, res) => {
  const { idPerson, mensaje, idChat, Nombres } = req.body;

  const query = 'INSERT INTO dbSedes.Mensajes(idPerson, mensaje, idChat) VALUES(?, ?, ?);';
  db.query(query, [idPerson, mensaje, idChat], (err, result) => {
    if (err) {
      console.error('Error al insertar el mensaje:', err);
      return res.status(500).json({ error: 'Error al enviar el mensaje' });
    }

    // Emitir el mensaje a otros clientes a través de socket.io
    io.emit('chat message', [idPerson, mensaje, Nombres, idChat]);

    const chatQuery = 'SELECT * FROM dbsedes.chats WHERE idChats = ?;';
    db.query(chatQuery, [idChat], (err, chats) => {
      if (err) {
        console.error('Error al recuperar el chat:', err);
        return;
      }

      if (chats.length > 0) {
        const chat = chats[0];
        let recipientId;

        if ((chat.idPerson === null && chat.idPersonDestino!==idPerson)  || chat.idPerson === idPerson) {
          recipientId = chat.idPersonDestino;
        } else{
          recipientId = chat.idPerson;
        }
        if(recipientId===null){
          return;
        }

        const tokensQuery = 'SELECT idPerson, token FROM dbsedes.tokens WHERE idPerson = ? AND status=1;'; ///////26/09 WHERE status
        db.query(tokensQuery, [recipientId], async (err, tokens) => {
          if (err) {
            console.error('Error al recuperar los tokens:', err);
            return;
          }

          for (const tokenObj of tokens) {
            const token = tokenObj.token;
            const tokenData = { idChat: idChat };
            await sendNotification(token, Nombres, mensaje, tokenData);/////////////////26/09
          }
        });
      }
    });

    res.json({ message: 'Mensaje enviado exitosamente' });
  });
});

async function sendNotification(token, title, body, additionalData) {///////////////26/09
  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: token,
  };

  if (additionalData && typeof additionalData === 'object' && Object.keys(additionalData).length > 0) {
    const stringData = {};
    for (const key in additionalData) {
      stringData[key] = String(additionalData[key]);
    }
    message.data = stringData;
    console.log(message.data);
  }

  try {
    const response = await admin.messaging().send(message);
    console.log('Mensaje enviado exitosamente:', response);
  } catch (error) {
    console.error('Error al enviar el mensaje:', error);
  }
}


/////////////////CIERRA UPDATE

app.post('/insertchat', (req, res) => {
  const { idPerson, idPersonDestino } = req.body;

  const query = 'INSERT INTO dbSedes.Chats(idPerson, idPersonDestino) VALUES(?, ?);';
  db.query(query, [idPerson, idPersonDestino ], (err, result) => {
    if (err) {
      console.error('Error al insertar el chat:', err);
      return res.status(500).json({ error: 'Error al insertar chat' });
    }

    res.json({ message: 'Mensaje enviado exitosamente' });
  });
});

//////////////////25/09Lunes//////////////NUEVO METODO/////////////
////////////////CAMBIO 26/09
app.post('/inserttoken', (req, res) => {
  const { token, idPerson } = req.body;
  const checkQuery = 'SELECT * FROM dbsedes.tokens WHERE token = ?;';
  db.query(checkQuery, [token], (err, result) => {
    if (err) {
      console.error('Error al verificar el token:', err);
      return res.status(500).json({ error: 'Error al verificar token' });
    }
    if (result.length > 0) {
      const updateQuery = 'UPDATE dbsedes.tokens SET idPerson = ?, status=1 WHERE token = ?;';
      db.query(updateQuery, [idPerson, token], (err, result) => {
        if (err) {
          console.error('Error al actualizar el token:', err);
          return res.status(500).json({ error: 'Error al actualizar token' });
        }
        res.json({ message: 'Token actualizado exitosamente' });
      });
    } else {
      const insertQuery = 'INSERT INTO dbsedes.tokens(token, idPerson) VALUES(?,?);';
      db.query(insertQuery, [token, idPerson], (err, result) => {
        if (err) {
          console.error('Error al insertar el token:', err);
          return res.status(500).json({ error: 'Error al insertar token' });
        }
        res.json({ message: 'Token registrado exitosamente' });
      });
    }
  });
});

/////////////26/09   NUEVO METODO UPDATE CERRAR SESIÓN TOKEN
app.put('/logouttoken', (req, res) => {
  const { token } = req.body;
  const query = 'UPDATE dbsedes.tokens SET status=0, FechaActualizacion=CURRENT_TIMESTAMP() WHERE token=?;';
  db.query(query, [token], (err, results) => {
    if (err) {
      console.error('Error al Actualizar en la base de datos:', err);
      res.status(500).json({ error: 'Error al Actualizar el token' });
      return;
    }
    res.json({ message: 'Token Actualizada exitosamente!', data: req.body });
  });
});



app.get('/getmessage/:id', (req, res) => {
  const id = req.params.id;

  const query = 'SELECT M.*, P.Nombres FROM dbsedes.Mensajes M \
  inner join dbsedes.Person P ON P.idPerson = M.idPerson \
  WHERE idChat = ?;';
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json(results);
  });;
});

app.get('/getchats/:id', (req, res) => {
  const id = req.params.id;

  const query = 'WITH LastMessageDates AS ( \
    SELECT  \
        idChat,  \
        MAX(fechaRegistro) as LastDate \
    FROM dbSedes.Mensajes \
    GROUP BY idChat \
)\
SELECT C.* \
FROM dbSedes.Chats C \
LEFT JOIN LastMessageDates LMD ON C.idChats = LMD.idChat \
WHERE (C.idPerson =? OR C.idPersonDestino=? OR (C.idPerson IS NULL AND LMD.idChat IS NOT NULL) ) AND C.status=1   \
ORDER BY \
    CASE WHEN LMD.LastDate IS NULL THEN 1 ELSE 0 END, \
    LMD.LastDate DESC, \
    C.idPersonDestino; ';
  db.query(query, [id, id], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json(results);
  });;
});

app.get('/getchatcliente/:id', (req, res) => {
  const id = req.params.id;

  const query = '  WITH LastMessageDates AS ( \
    SELECT  \
        idChat,  \
        MAX(fechaRegistro) as LastDate \
    FROM dbSedes.Mensajes \
    GROUP BY idChat \
) \
SELECT C.* \
FROM dbSedes.Chats C \
LEFT JOIN LastMessageDates LMD ON C.idChats = LMD.idChat \
WHERE (C.idPerson =? OR C.idPersonDestino=? AND C.idPerson IS NULL) AND C.status=1 \
ORDER BY \
    CASE WHEN LMD.LastDate IS NULL THEN 1 ELSE 0 END, \
    LMD.LastDate DESC, \
    C.idPersonDestino; ';
  db.query(query, [id, id], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json(results);
  });;
});

/////////////NUEVO METODO/////////////
app.put('/deletechat/:id', (req, res) => {
  const id = req.params.id;

  const query = 'UPDATE dbsedes.chats SET status=0 WHERE idChats=?';
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error al eliminar chat:', err);
      res.status(500).json({ error: 'Error al eliminar chat' });
      return;
    }
    res.json(results);
  });;
});

//////////////CAMBIO STATUS//////////
app.get('/getnamespersondestino/:id', (req, res) => {
  const id = req.params.id;

  const query = "WITH LastMessages AS ( \
    SELECT  \
        idChat, \
        MAX(fechaRegistro) as LastDate \
    FROM dbSedes.Mensajes \
    GROUP BY idChat \
) \
, LastMessageDetails AS (\
    SELECT M.idChat, M.mensaje, M.fechaRegistro\
    FROM dbSedes.Mensajes M\
    JOIN LastMessages LM ON M.idChat = LM.idChat AND M.fechaRegistro = LM.LastDate\
)\
SELECT P.idPerson, P.Nombres, COALESCE(LMD.mensaje, '') as mensaje \
FROM dbSedes.Person P \
LEFT JOIN dbSedes.Chats C ON C.idPersonDestino = P.idPerson OR C.idPerson = P.idPerson \
LEFT JOIN LastMessageDetails LMD ON LMD.idChat = C.idChats \
WHERE (C.idPerson = ? OR C.idPersonDestino = ?  OR(C.idPerson IS NULL AND P.idRol=8 AND mensaje IS NOT NULL)) AND P.idPerson !=?  AND C.status=1 \
ORDER BY \
    CASE WHEN LMD.fechaRegistro IS NULL THEN 1 ELSE 0 END, \
    LMD.fechaRegistro DESC, \
    C.idPersonDestino; \
";
  db.query(query, [id, id, id], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json(results);
  });;
});

app.get('/lastidchat', (req, res) => {
  db.query('select idChats AS AUTO_INCREMENT FROM dbSedes.Chats WHERE idChats=LAST_INSERT_ID()', (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener id' });
      return;
    }
    res.json(results);
  });
});


app.get('/getidrol/:id', (req, res) => {
  const id = req.params.id
  db.query('SELECT idRol FROM dbsedes.person WHERE idPerson = ?;',[Number.parseInt(id)], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener id' });
      return;
    }
    res.json(results);
  });
});


///////////////////////20-10
app.get('/getpersonbyemail/:correo', (req, res) => {
  const email = req.params.correo;
  db.query('SELECT idPerson FROM dbSedes.Person WHERE correo = ?',[email], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener id' });
      return;
    }
    res.json(results);
  });
});




///////////////////////27/09 CAMBIO///////////////
app.get('/allaccounts', (req, res) => {
  db.query('SELECT idPerson, Nombres, Apellidos, FechaNacimiento, Correo, Password, Carnet, Telefono, FechaCreacion, Status, Longitud, Latitud, R.NombreRol FROM Person P INNER JOIN Roles R on R.IdRol = P.IdRol WHERE P.Status=1 AND (P.IdRol !=9);', (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json(results);
  });
});


app.get('/allclients', (req, res) => {
  db.query('SELECT idPerson, Nombres, Apellidos, FechaNacimiento, Correo, Password, Carnet, Telefono, FechaCreacion, Status, Longitud, Latitud, R.NombreRol FROM Person P INNER JOIN Roles R on R.IdRol = P.IdRol WHERE P.Status=1 AND P.IdRol = 8;', (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json(results);
  });
});
////////////////////27/09///////////CAMBIO
app.get('/user', (req, res) => {
  const { correo, password } = req.query; // Obtiene el correo y la contraseña de los parámetros de consulta

  if (!correo || !password) {
    return res.status(400).json({ error: 'Debes proporcionar un correo y una contraseña.' });
  }

  // Consulta la base de datos para encontrar un usuario con el correo y la contraseña proporcionados
  db.query('SELECT idPerson, Nombres, Apellidos, FechaNacimiento, Correo, Password, Carnet, Telefono, FechaCreacion, Status, Longitud, Latitud, R.NombreRol FROM Person P INNER JOIN Roles R on R.IdRol = P.IdRol WHERE status=1 AND Correo = ? AND Password = ?', [correo, password], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      return res.status(500).json({ error: 'Error al obtener el usuario' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si se encontró un usuario, lo devuelve como respuesta
    const usuario = results[0];
    res.json(usuario);
  });
});

app.get('/cardholderbyuser/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT P.idPerson, P.Nombres, P.Apellidos, P.FechaNacimiento, P.Correo, P.Password, P.Carnet, P.Telefono, P.FechaCreacion, P.Status, P.Longitud, P.Latitud, R.NombreRol \
  FROM Person P \
  INNER JOIN Roles R on R.IdRol = P.IdRol \
  WHERE P.idPerson = (select idJefeCampaña from Cardholder WHERE idPerson = ?);',
    [id], (err, results) => {
      if (err) {
        console.error('Error al consultar la base de datos:', err);
        return res.status(500).json({ error: 'Error al obtener el usuario' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Si se encontró un usuario, lo devuelve como respuesta
      const usuario = results[0];
      res.json(usuario);
    });
});


/////////////10-10-23 MODIFICACIÓN USUARIO
app.post('/register', (req, res) => {
  const { Nombres, Apellidos, FechaNacimiento, Correo, Password, Carnet, Telefono, FechaCreacion, Status, Longitud, Latitud, IdRol } = req.body;

  const checkEmailQuery = 'SELECT * FROM Person WHERE Correo = ? AND Status=1';
  db.query(checkEmailQuery, [Correo], (err, result) => {
    if (err) {
      console.error('Error al verificar el correo:', err);
      res.status(500).json({ error: 'Error al verificar el correo' });
      return;
    }

    if (result.length > 0) {
      res.status(400).json({ error: 'El correo ya está registrado' });
      return;
    }

    const insertQuery = 'INSERT INTO Person (Nombres, Apellidos, FechaNacimiento, Correo, Password, Carnet, Telefono, FechaCreacion, Status, Longitud, Latitud, IdRol) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [Nombres, Apellidos, FechaNacimiento, Correo, Password, Carnet, Telefono, FechaCreacion, Status, Longitud, Latitud, IdRol];

    db.query(insertQuery, values, (err, result) => {
      if (err) {
        console.error('Error al registrar usuario:', err);
        res.status(500).json({ error: 'Error al registrar usuario' });
        return;
      }
      res.json({ message: 'Usuario registrado exitosamente', userId: result.insertId });
    });
  });
});

///////////10-10-23 NUEVO METODO
app.get('/personbyemail/:email', (req, res) => {
  const { email } = req.params;

  db.query('SELECT P.idPerson, P.Nombres, P.Apellidos, P.FechaNacimiento, P.Correo, P.Password, P.Carnet, P.Telefono, P.FechaCreacion, P.Status, P.Longitud, P.Latitud, R.NombreRol \
  FROM Person P \
  INNER JOIN Roles R on R.IdRol = P.IdRol \
  WHERE P.Correo=? AND P.Status=1;',
    [email], (err, results) => {
      if (err) {
        console.error('Error al consultar la base de datos:', err);
        return res.status(500).json({ error: 'Error al obtener el usuario' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Si se encontró un usuario, lo devuelve como respuesta
      const usuario = results[0];
      res.json(usuario);
    });
});


app.get('/campanas', (req, res) => {

  db.query('SELECT * FROM dbSedes.Campañas WHERE status=1;', (err, results) => {

    if (err) {

      console.error('Error al consultar la base de datos:', err);

      res.status(500).json({ error: 'Error al obtener usuarios' });

      return;

    }

    res.json(results);

  });

});

/////////////////////////11-10 NUEVO
app.post('/registerqr', (req, res) => {
  const { id } = req.body;
  const query = 'INSERT INTO dbsedes.qr(QrString) VALUES(?);';
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error al insertar en la base de datos:', err);
      res.status(500).json({ error: 'Error al registrar la campaña' });
      return;
    }
    res.json({ message: 'Campaña registrada exitosamente!', data: req.body });
  });
});

/////////////////11-10 NUEVO
app.get('/getpetbyid/:id', (req, res) => {
  const id = req.params.id;
  db.query('SELECT * FROM dbsedes.mascotas WHERE idMascotas=?', [id], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener id' });
      return;
    }
    res.json(results);
  });
});

app.get('/getpropietariobyid2/:id', (req, res) => {
  const idPerson = req.params.id;

  const query = `SELECT P.idPerson, P.Nombres, P.Apellidos, P.FechaNacimiento, P.Correo, 
                 P.Password, P.Carnet, P.Telefono, P.FechaCreacion, P.Status, P.Longitud, 
                 P.Latitud, R.idRol 
                 FROM dbSedes.Person P 
                 INNER JOIN Roles R ON P.IdRol = R.IdRol 
                 WHERE P.idPerson = ?`;

  db.query(query, [idPerson], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener el propietario' });
      return;
    }

    if (results.length === 0) {
      res.status(404).json({ error: 'Propietario no encontrado' });
      return;
    }

    // Devuelve la información del propietario como JSON
    const propietario = results[0];
    res.json(propietario);
  });
});


//////////////////12-10 JOSE BASCOPE
app.get('/propietariomascotas/:idPersona', (req, res) => {
  const idPersona = req.params.idPersona; 
  db.query('SELECT m.idMascotas, m.Nombre, m.Raza, m.Edad, m.Color, m.Descripcion, m.IdPersona, m.Sexo, m.Especie, m.Castrado, m.Vacunado, m.FechaUltimaVacuna FROM dbSedes.Mascotas m INNER JOIN dbSedes.Person p ON m.IdPersona = p.idPerson WHERE m.Status = 1 AND m.IdPersona = ?;', [idPersona], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener mascotas' });
      return;
    }
    res.json(results);
  });
});

////////////12-10 JOSE BASCOPE
app.get('/lastidmascota', (req, res) => {
  db.query('SELECT MAX(idMascotas) AS ultimo_id FROM mascotas', (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      res.status(500).json({ error: 'Error al obtener el último ID de mascota' });
      return;
    }
    res.json({ ultimo_id: results[0].ultimo_id });
    console.log('ultimo id : '+ results[0].ultimo_id);
  });
});





app.post('/campanas', (req, res) => {
  const { NombreCampaña, Descripcion, Categoria, userId } = req.body;
  const FechaInicio = new Date(req.body.FechaInicio).toISOString().slice(0, 19).replace('T', ' ');
  const FechaFinal = new Date(req.body.FechaFinal).toISOString().slice(0, 19).replace('T', ' ');
  const query = 'INSERT INTO dbSedes.Campañas (NombreCampaña, Descripcion, Categoria, FechaInicio, FechaFinal, userId) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [NombreCampaña, Descripcion, Categoria, FechaInicio, FechaFinal, userId], (err, results) => {
    if (err) {
      console.error('Error al insertar en la base de datos:', err);
      res.status(500).json({ error: 'Error al registrar la campaña' });
      return;
    }
    res.json({ message: 'Campaña registrada exitosamente!', data: req.body });
  });
});

app.put('/updatemascota/:id', (req, res) => {
  const idMascotas = req.params.id;
  const {
    Nombre,
    Raza,
    Edad,
    Color,
    Descripcion,
    IdPersona,
    Sexo,
    Especie,
    Castrado,
    Vacunado,
    FechaUltimaVacuna
  } = req.body;

  const query = `UPDATE dbSedes.Mascotas 
                 SET Nombre = ?, 
                     Raza = ?, 
                     Edad = ?, 
                     Color = ?, 
                     Descripcion = ?, 
                     IdPersona = ?, 
                     Sexo = ?, 
                     Especie = ?, 
                     Castrado = ?, 
                     Vacunado = ?, 
                     FechaUltimaVacuna = ?
                 WHERE idMascotas = ?`;

  db.query(query, [
    Nombre,
    Raza,
    Edad,
    Color,
    Descripcion,
    IdPersona,
    Sexo,
    Especie,
    Castrado,
    Vacunado,
    FechaUltimaVacuna,
    idMascotas
  ], (err, result) => {
    if (err) {
      console.error('Error al actualizar la mascota:', err);
      res.status(500).json({ error: 'Error al actualizar la mascota' });
      return;
    }

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Mascota no encontrada' });
    } else {
      res.json({ message: 'Mascota actualizada exitosamente' });
    }
  });
});

app.put('/disablemascota/:id', (req, res) => {
  const idMascotas = req.params.id;
  const { Status } = req.body;

  const query = `UPDATE dbSedes.Mascotas 
                 SET Status = ? 
                 WHERE idMascotas = ?`;

  db.query(query, [Status, idMascotas], (err, result) => {
    if (err) {
      console.error('Error al actualizar el status de la mascota:', err);
      res.status(500).json({ error: 'Error al actualizar el status de la mascota' });
      return;
    }

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Mascota no encontrada' });
    } else {
      res.json({ message: 'Status de la mascota actualizado exitosamente' });
    }
  });
});




app.put('/campanas/:id', (req, res) => {
  const { idCampañas, NombreCampaña, Descripcion, Categoria, userId } = req.body;
  const FechaInicio = new Date(req.body.FechaInicio).toISOString().slice(0, 19).replace('T', ' ');
  const FechaFinal = new Date(req.body.FechaFinal).toISOString().slice(0, 19).replace('T', ' ');
  const query = 'UPDATE dbSedes.Campañas SET NombreCampaña=?, Descripcion=?, Categoria=?, FechaInicio=?, FechaFinal=?, FechaActualizacion=CURRENT_TIMESTAMP(), userId=? WHERE idCampañas=?';
  db.query(query, [NombreCampaña, Descripcion, Categoria, FechaInicio, FechaFinal, userId, idCampañas], (err, results) => {
    if (err) {
      console.error('Error al Actualizar en la base de datos:', err);
      res.status(500).json({ error: 'Error al Actualizar la campaña' });
      return;
    }
    res.json({ message: 'Campaña Actualizada exitosamente!', data: req.body });
  });
});


app.put('/update/:id', (req, res) => {
  const { id, Nombres, Apellidos, Carnet, Telefono, IdRol, Latitud, Longitud, Correo } = req.body;
  const FechaNacimiento = new Date(req.body.FechaNacimiento).toISOString().slice(0, 19).replace('T', ' ');
  const query = 'UPDATE dbSedes.Person SET Nombres=?, Apellidos=?, FechaNacimiento=?, Carnet=?, Telefono=?, IdRol=?, Latitud=?, Longitud=?,Correo=? WHERE idPerson=?';
  db.query(query, [Nombres, Apellidos, FechaNacimiento, Carnet, Telefono, IdRol, Latitud, Longitud, Correo, id], (err, results) => {
    if (err) {
      console.error('Error al Actualizar en la base de datos:', err);
      res.status(500).json({ error: 'Error al Actualizar la persona' });
      return;
    }
    res.json({ message: 'Persona Actualizada exitosamente!', data: req.body });
  });
});



app.put('/campanas/delete/:id', (req, res) => {
  const { idCampañas, userId } = req.body;
  const query = 'UPDATE dbSedes.Campañas SET status=0, FechaActualizacion=CURRENT_TIMESTAMP(), userId=? WHERE idCampañas=?';
  db.query(query, [userId, idCampañas], (err, results) => {
    if (err) {
      console.error('Error al Eliminar en la base de datos:', err);
      res.status(500).json({ error: 'Error al Eliminar la campaña' });
      return;
    }
    res.json({ message: 'Campaña Eliminada exitosamente!', data: req.body });
  });
});

////////////////////27/09/////////CAMBIO
app.get('/nextidcampanas', (req, res) => {
  db.query('select idCampañas AS AUTO_INCREMENT FROM dbSedes.Campañas WHERE idCampañas=LAST_INSERT_ID()', (err, results) => {
    if (err) {

      console.error('Error al consultar la base de datos:', err);

      res.status(500).json({ error: 'Error al obtener id' });

      return;

    }

    res.json(results);

  });

});

////////////////27/09 NUEVO METODO//////////
app.put('/accountdelete', (req, res) => {
  const { idPerson } = req.body;
  console.log(idPerson);
  const query = 'UPDATE dbSedes.person SET status=0 WHERE idPerson=?';
  db.query(query, [idPerson], (err, results) => {
    const query1 = 'UPDATE dbSedes.tokens SET status=0 WHERE idPerson=?';
    db.query(query1, [idPerson], (err, results) => {
      if(err){
        console.error('Error al Eliminar en la base de datos:', err);
        res.status(500).json({ error: 'Error al Eliminar la cuenta' });
        return
      }
    });
    if (err) {
      console.error('Error al Eliminar en la base de datos:', err);
      res.status(500).json({ error: 'Error al Eliminar la cuenta' });
      
      return;
    }
    res.json({ message: 'Cuenta Eliminada exitosamente!', data: req.body });
  });
});


//pasar

app.get('/nextidperson', (req, res) => {

  db.query('select MAX(idPerson) AS AUTO_INCREMENT FROM dbSedes.Person', (err, results) => {

    if (err) {

      console.error('Error al consultar la base de datos:', err);

      res.status(500).json({ error: 'Error al obtener id' });

      return;

    }

    res.json(results);

  });

});

app.post('/registerPet', (req, res) => {
  const { Nombre, Raza, Edad, Color, Descripcion, IdPersona, Sexo, Especie, Castrado, Vacunado, FechaUltimaVacuna } = req.body;

  const query = 'INSERT INTO Mascotas (Nombre, Raza, Edad, Color, Descripcion, IdPersona, Sexo, Especie, Castrado, Vacunado, FechaUltimaVacuna) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

  db.query(
    query,
    [Nombre, Raza, Edad, Color, Descripcion, IdPersona, Sexo, Especie, Castrado, Vacunado, FechaUltimaVacuna || null],
    (err, result) => {
      if (err) {
        console.error('Error al insertar la mascota:', err);
        return res.status(500).json({ error: 'Error al registrar la mascota' });
      }

      res.json({ message: 'Mascota registrada exitosamente', mascotaId: result.insertId });
    }
  );
});


//pasar

app.post('/registerjefecarnetizador', (req, res) => {
  const { idPerson, idJefeCampaña } = req.body;
  const query = 'INSERT INTO Cardholder (idPerson, idJefeCampaña) VALUES (?, ?);';
  const values = [idPerson, idJefeCampaña];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error al registrar CardHolder:', err);
      res.status(500).json({ error: 'Error al registrar CardHolder' });
      return;
    }
    res.json({ message: 'CardHolder registrado exitosamente', userId: result.insertId });
  });
});

app.put('/updatejefecarnetizador', (req, res) => {
  const { idPerson, idJefeCampaña } = req.body;
  const query = 'UPDATE Cardholder SET idJefeCampaña=? WHERE idPerson=?;';
  const values = [idJefeCampaña, idPerson];
  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error al actualizar CardHolder:', err);
      res.status(500).json({ error: 'Error al actualizar CardHolder' });
      return;
    }
    res.json({ message: 'CardHolder actualizado exitosamente', userId: result.insertId });
  });
});

app.get('/getpersonbyid/:id', (req, res) => {
  const { id } = req.params;

  db.query('SELECT P.idPerson, P.Nombres, P.Apellidos, P.FechaNacimiento, P.Correo, P.Password, P.Carnet, P.Telefono, P.FechaCreacion, P.Status, P.Longitud, P.Latitud, R.NombreRol \
  FROM Person P \
  INNER JOIN Roles R on R.IdRol = P.IdRol \ WHERE idPerson = ?', [id], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      return res.status(500).json({ error: 'Error al obtener la persona' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Persona no encontrada' });
    }

    // Si se encontró una persona, la devuelve como respuesta
    const persona = results[0];
    res.json(persona);
  });
});

app.get('/checkCodeExists/:userId', (req, res) => {
  const { userId } = req.params;
  const query = 'SELECT COUNT(*) AS count FROM CodigoPersona WHERE idCodigo_Persona=?';

  // Aquí debes ejecutar la consulta SQL para verificar si existe un código para el usuario
  // Usa tu librería de base de datos preferida (por ejemplo, mysql2 o sequelize)

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error al verificar el código en la base de datos:', err);
      res.status(500).json({ error: 'Error al verificar el código' });
      return;
    }
    const count = results[0].count;
    res.json({ exists: count > 0 });
  });
});

app.put('/updateCode/:userId/:code', (req, res) => {
  const { userId, code } = req.params;
  const query = 'UPDATE CodigoPersona SET Codigo=?, FechaActualizacion=NOW() WHERE idCodigo_Persona=?';

  // Aquí debes ejecutar la consulta SQL para actualizar el código
  // Usa tu librería de base de datos preferida (por ejemplo, mysql2 o sequelize)

  db.query(query, [code, userId], (err, results) => {
    if (err) {
      console.error('Error al actualizar el código en la base de datos:', err);
      res.status(500).json({ error: 'Error al actualizar el código' });
      return;
    }
    res.json({ message: 'Código actualizado exitosamente' });
  });
});

app.post('/insertCode/:userId/:code', (req, res) => {
  const { userId, code } = req.params;
  const query = 'INSERT INTO codigopersona (idCodigo_Persona, Codigo, Status, FechaRegistro, FechaActualizacion) VALUES (?, ?, 1, NOW(), NOW())';

  // Aquí debes ejecutar la consulta SQL para insertar un nuevo registro
  // Usa tu librería de base de datos preferida (por ejemplo, mysql2 o sequelize)

  db.query(query, [userId, code], (err, results) => {
    if (err) {
      console.error('Error al insertar el código en la base de datos:', err);
      res.status(500).json({ error: 'Error al insertar el código' });
      return;
    }
    res.json({ message: 'Código insertado exitosamente' });
  });
});

app.get('/checkemail/:email', (req, res) => {
  const { email } = req.params;

  // Realiza una consulta a tu base de datos para verificar si el correo existe
  const query = 'SELECT idPerson, Nombres, Correo, FechaCreacion, Longitud, Latitud FROM Person P INNER JOIN Roles R on R.IdRol = P.IdRol WHERE Correo = ?';
  db.query(query, [email], (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      return res.status(500).json({ error: 'Error al consultar la base de datos' });
    }

    if (results.length === 0) {
      // El correo no existe en la base de datos
      return res.status(404).json({ error: 'Correo no encontrado' });
    }

    // El correo existe en la base de datos, devuelve el idPerson
    const result = results[0] // Cambiado a idPerson
    res.json({ result }); // Cambiado a idPerson
  });
});

app.get('/validateCode', (req, res) => {
  const userId = req.query.userId;
  const code = req.query.code;

  const sql = 'SELECT * FROM codigopersona WHERE idCodigo_Persona = ? AND Codigo = ?';

  db.query(sql, [userId, code], (err, results) => {
    if (err) {
      console.error('Error al ejecutar la consulta SQL: ' + err.stack);
      res.status(500).json({ success: false, message: 'Error en el servidor' });
      return;
    }

    if (results.length === 0) {
      // No se encontró ningún código válido
      res.json({ success: false, message: 'El código OTP no es válido' });
    } else {
      // Se encontró un código válido
      res.json({ success: true, message: 'El código OTP es válido' });
    }
  });
});

// Agrega esta ruta para cambiar la contraseña
app.put('/changePassword', (req, res) => {
  const userId = req.body.userId; // Accede al userId desde el cuerpo de la solicitud
  const newPassword = req.body.newPassword;

  // Realiza una consulta SQL para actualizar la contraseña
  const sql = 'UPDATE person SET Password = ? WHERE idPerson = ?';

  db.query(sql, [newPassword, userId], (err, results) => {
    if (err) {
      console.error('Error al cambiar la contraseña: ' + err.stack);
      res.status(500).json({ success: false, message: 'Error en el servidor' });
      return;
    }

    if (results.affectedRows > 0) {
      // Contraseña cambiada con éxito
      res.json({ success: true, message: 'Contraseña cambiada con éxito' });
    } else {
      // No se encontró ningún usuario con el ID proporcionado
      res.json({ success: false, message: 'Usuario no encontrado' });
    }
  });
});




const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${port}`);
});

