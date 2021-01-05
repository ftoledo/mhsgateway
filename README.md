# MHSGateway for Synchronet BBS

This project will add support to gate messages (initially) between
Synchronet BBS and Worldgroup Server/Major BBS using the included
Novell MHS gateway.

The code is WIP and do not use for production environment yet!


[es]

## Historia

La idea detras de es este proyecto fue la de llegar a tener redes dentro
del Woldgroup.

Lamentablemente WG no tiene soporte de FTN ni de una red QWK (Si para descarga
de usuarios, pero no para intercambian mensajes es un Red).

El soporte de NNTP es obsoleto tambien por lo tanto se hace dificil importar
mensajes externos al WG.

Cuando comencé con el BBS yo usaba WG, y un Sysop de Los Cactus BBS, Fabian
Gervan habia scrito una serie de programtias en QBasic (sin mal no recuerdo)
que convertia los paquetes de fido en mensajes MHS que el WG los importaba.

Entoces, empece con un proyecto FTN2MHS (https://github.com/ftoledo/ftn2mhs)
que fue la primer idea. Algunos scripts y programas sueltos, mezcla entre
ejecutar cosas dsde el windows y el linux y lo terminene abandonando (Por
ahora, porque es algo que me interesa resolver en algun momento).

## Gateway

Como funciona este gateway?, basicamente simula la idea de sbbsecho de SBBS,
el cual se encarga de exportar / importar paquetes de FTN. Solo que el formato
de los paquetes es para MHS (SMF-70).

## Instalacion

Copiar los archivos mhsgate.js y mhsgatecfg.js dentro del dir de
MODS (/sbbs/mods).

Luego ejecutar con jsexec la herramienta de configuración

# /sbbs/exec $ ./jsexec mhsgatecfg

Se tienen que dar de alta los nodos y las areas que cada uno transfiere

La configuracion para SBBS se guarda en el directorio de CTRL
/sbbs/ctrl/mhsgate.ini

Ejemplo:

```
[global]
gateway_name=SBBS

[node:WG]
description=WG Server
created=05-01-2021 00:21:50
active=true
pickup=/home/samba/mhs/outbound
sendto=/home/samba/mhs/inbound
type=MBBS

[area:WG:DOCKSUDNOTICES]
import=notices@fidonet
export=/notices
created=05-01-2021 05:24:43
active=true

[area:WG:FIDOCRDREGION90]
import=region90@fidonet
export=/region90
created=05-01-2021 14:04:04
active=true

[area:WG:FIDOCRDZONA4GEN]
import=zona4.general@fidonet
export=/zona4.general
created=05-01-2021 14:36:54
active=true

```

Cada nodo tiene que tener las rutas de import y export del filesystem del WG.
Estas se pueden compartir via samba, ftp, rsync o lo que sea.

Esquema de ejemplo usando samba:

SBBS Server debe compartir via Samba /sbbs/data/mhs

WG Server debe conectar la unidad N: a \\sbbsserver\mhs

```
    +--------------------++-----------------------------+
    |      WG Server     ||          SBBS Server        |
    |                    ||                             |
    | OUTMSG     N:\out  || /sbbs/data/mhs/out   PICKUP |
    | INMSG      N:\in   || /sbbs/data/mhs/in    SENDTO |
    +--------------------++-----------------------------+
```

Cada area tiene mapeado la direccion con la se generan los mensajes
MHS (export), por ejempo el nombre del foro en el WG /Hello

Tambien tiene la direccion con la cual llegan los mensajes de cierto foro para
importar ejemplo: region90@fidonet
Esta configuracion sale de la deficinion de "echoes" de la configuracion del
foro en el WG. Y se debe agregar como:

Add Echoe: mhs:regio90@fidonet

Entonces cuadno uno escribe en un foro del WG, este se exporta via MHS con
 la direccion region90@fidonet

Cuando MHSGateway lo importa verifica esa direccion si corresponde a un area
del SBBS en caso afirmativo, lo importa al Msgbase de SBBS

Cuando MHSGateway exporta los mensajes, veerifica cual es el ultimo puntero
exportado en el .INI del area. Y si hay mensajes nuevo que expotar, los genera
con la direccion de salida /REGION90, de esta manera el WG lo importa al
al foto "REGION90"










