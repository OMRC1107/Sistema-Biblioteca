-- Esquema de la base de datos de Sistema-Biblioteca (MySQL 5.7+ / 8 / MariaDB 10.3+).
--
-- El servidor crea estas tablas solo al iniciar (CREATE TABLE IF NOT EXISTS), así que
-- este archivo es principalmente documentación. Para crear la base y un usuario:
--
--   CREATE DATABASE biblioteca CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   CREATE USER 'biblioteca'@'localhost' IDENTIFIED BY 'cambia-esta-clave';
--   GRANT ALL PRIVILEGES ON biblioteca.* TO 'biblioteca'@'localhost';
--
-- Cada sentencia termina en «;» (db.js las separa por ese carácter).

CREATE TABLE IF NOT EXISTS usuarios (
  codigo CHAR(7)      NOT NULL,                              -- código único de 7 cifras
  nombre VARCHAR(60)  NOT NULL,
  clave  VARCHAR(255) NOT NULL,                              -- scrypt: «sal:hash» (nunca la contraseña)
  creado DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservas (
  mesa   VARCHAR(40) NOT NULL,                               -- p. ej. «sala-8#2» (mesa 2 de la Sala 8)
  codigo CHAR(7)     NOT NULL,
  desde  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hasta  DATETIME    NOT NULL,                               -- fin de la reserva: después de esta hora la mesa queda libre
  PRIMARY KEY (mesa),                                        -- una mesa solo puede tener una reserva
  UNIQUE KEY uq_reserva_codigo (codigo),                     -- una persona, una mesa a la vez
                                                             -- (para permitir varias: eliminar este índice)
  CONSTRAINT fk_reserva_usuario FOREIGN KEY (codigo) REFERENCES usuarios (codigo) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro (historial) de todas las reservas: no se borra cuando la reserva termina
-- ni cuando se quita. Si la persona la quita antes de tiempo, hora_fin pasa a ser
-- la hora en que la quitó.
CREATE TABLE IF NOT EXISTS historial_reservas (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  codigo      CHAR(7)       NOT NULL,                        -- quién reservó
  sala        VARCHAR(60)   NOT NULL,                        -- p. ej. «Sala 8»
  mesa        SMALLINT UNSIGNED NOT NULL,                    -- número de la mesa dentro de la sala
  fecha       DATE          NOT NULL,                        -- día de la reserva
  hora_inicio TIME          NOT NULL,
  hora_fin    TIME          NOT NULL,
  PRIMARY KEY (id),
  KEY idx_historial_codigo (codigo, fecha),
  KEY idx_historial_mesa (sala, mesa, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
