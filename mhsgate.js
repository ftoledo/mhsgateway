load("smbdefs.js");
const MHSGATEWAY_VERSION = '1.0';

var ini = new File(system.ctrl_dir + "mhsgate.ini");

if (! ini.open('r')) {
    log(LOG_ERROR, "Error open .ini configuration file: " + ini.name);
    exit(1);
}


//load ini as cfg
settings = ini.iniGetAllObjects();
var cfg = {};
for(var i in settings) {
    cfg[settings[i].name.toLowerCase()] = settings[i];
}

// load nodes
var nodes_list = ini.iniGetSections('node:');
var nodes = [];
for (n in nodes_list) {
    nodes.push(nodes_list[n].slice(5).toLowerCase());
}



ini.close();

if(!js.global.bbs) {
//    alert("This module must be run as BBS event");
//    exit(1);
}


function parse_header(msg) {
    log(LOG_DEBUG, "Parse headers");
    var headers = [];
    var hdr = {};

    for (line in msg) {
        if (msg[line].trim() == "") {
            log(LOG_DEBUG, "Found first blank line and break");
            break;
        }
        if (msg[line].trim() == "SMF-70") {
            field = "SMF-70";
            value = "SMF-70";
        }
        else {
            if (msg[line].trim().indexOf(":") == -1) {
                log(LOG_INFO, "Skip unexpected header field: " + msg[line]);
                continue;
            }
            field = msg[line].slice(0,msg[line].indexOf(":")).trim().toLowerCase();
            value = msg[line].slice(msg[line].indexOf(":")+1,msg[line].length).trim();
        }
        log(LOG_DEBUG, "Field: " + field);
        hdr[field] = value;

        headers = hdr;

    }
    return headers;
}


function format_mhs_from_addr(from) {
    part = from.indexOf(' ');
    domain = from.slice(0,part).trim();
    domain = domain.split('@');
    domtext = domain[1];
    name = from.slice(part).trim();
    name = name.split(' ');
    nametext = name[1].slice(0,name[1].length-1).trim();

    log(LOG_DEBUG, "Name  : " + nametext);
    log(LOG_DEBUG, "Domain: " + domtext);

    return nametext + '@' + domtext;

}

function parse_body(msg) {

    log(LOG_DEBUG,"Parse body");
    var found = false;

    for (line in msg) {
        log(LOG_DEBUG, "Skip header line: " + line);
        if (msg[line].trim() == "") {
            break;
        }
    }

    return msg.slice(parseInt(line)+2);

}


function mark_as_bad(file) {
    log(LOG_INFO, "Mark as bad file: " + file);
    file_rename(file, file + ".BAD");

}

function import() {

    // pickup each node

    for (node in nodes) {

        if (cfg['node:' + nodes[node]].active != true) {
            log(LOG_INFO, "Skip inactive node: " + nodes[node]);
            continue;
        }

        log(LOG_INFO, "Scanning node: " + nodes[node]);

        var files = [];
        files = directory(cfg['node:' + nodes[node]].pickup + "/*");
        for (f in files) {

            //skip directories
            if (file_isdir(files[f]))
                continue;

            if (files[f].toLowerCase().slice(-3) == "bad") {
                log(LOG_INFO, "Skip bad file: " + files[f]);
                continue;
            }

            log(LOG_INFO, "** Processing: " + files[f]);
            var fp = new File(files[f]);
            if (! fp.open("r")) {
                log(LOG_INFO, "Can't open file: " + files[f]);
            } else {
                var msg = [];

                var msg = fp.readAll();
                fp.close();
                header = parse_header(msg);
                body = parse_body(msg);
                //validations
                if (header['SMF-70'] == undefined){
                    log(LOG_WARNING, "No SMF-70 header found");
                    mark_as_bad(fp.name);
                    continue;
                }
                var dest_area = header['to'].slice(0,header['to'].indexOf('@'));
                dest_area = dest_area.toLowerCase();
                log(LOG_DEBUG,dest_area);

                if (cfg['area:'+dest_area]) {
                    if (cfg['area:'+dest_area].active != true) {
                        log(LOG_INFO, "Skip inactive area: " + dest_area);
                        continue;
                    }
                    if (cfg['area:'+dest_area].target) {
                        dest_sub = cfg['area:'+dest_area].target;
                        log(LOG_INFO, "Map: " + dest_area + " => " + dest_sub);
                        var msgbase = new MsgBase(dest_sub);
                        if (msgbase.open()) {
                            var newhdr = {
                                to: 'All',
                                from: format_mhs_from_addr(header['from']),
                                subject: header['subject'],
                                from_agent: AGENT_PROCESS,
                                from_net_type: NET_MHS,
                                from_net_addr: format_mhs_from_addr(header['from']),
                                summary: header['from'],
                                //tags: 'MHS',
                            };

                            var newbody = body.join("\n");

                            if (msgbase.save_msg(newhdr, newbody)) {
                                log(LOG_INFO, "Message Saved!");
                                if (files[f].toLowerCase().slice(-5) == 'nodel') {
                                    log(LOG_INFO, "Skip .nodel test file");
                                }
                                else {
                                    if (fp.remove()) {
                                        log(LOG_INFO, "File removed: " + fp.name);

                                    }
                                    else {
                                        log(LOG_ERROR, "File processed but not removed (check permissions): " + fp.error);
                                    }
                                }
                            }
                            else {
                                log(LOG_ERROR, "Cannot save message into msgbase: " + msgbase.last_error);
                            }
                        }
                        else {
                            log(LOG_ERROR, "Cannot open msgbase(" + msgbase.last_error+"): " + dest_sub );
                            continue;
                        }
                    }
                    else {
                        log(LOG_ERROR, "Found area: " + dest_area  + " with no Target settings");
                        continue;
                    }

                }
                else {
                    log(LOG_WARNING, "Area no found: " + dest_area);
                    continue;
                }


               //print (JSON.stringify(body));
               print(JSON.stringify(header));
            }
        }

    }
}

import();
