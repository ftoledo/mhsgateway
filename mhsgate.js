load("smbdefs.js");
const MHSGATEWAY_VERSION = '1.0';
"use strict";




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

// load nodes as array
function load_nodes() {

    var ini_nodes = ini.iniGetSections('node:');
    var nodes = [];
    var n;

    for (n in ini_nodes) {
        nodes.push(ini_nodes[n].slice(5));
    }
    return nodes;
}

//load areas of node as array
function load_areas(node) {
    var ini_areas = ini.iniGetSections('area:' + node + ':');
    var areas = [];
    var a;

    slice_area = 'area:' + node + ':';

    for (a in ini_areas) {
        areas.push(ini_areas[a].slice(slice_area.length));
    }
    return areas;
}


// get the last prt exported from node / area pair
// this use the sub ini file in data/subs directory

function get_last_ptr(node, area) {

    var msgbase = new MsgBase(area);

    if (msgbase.cfg) {

        ini_name = msgbase.cfg.data_dir + msgbase.cfg.code + ".ini";
        var ini_msg =  new File(ini_name);
        if (! ini_msg.open('r')) {
            log(LOG_WARNING, "Error open .ini configuration for msgbase: " + ini_name);
            log(LOG_WARNING, "Asume first time run...");
            return 0;
        }
        else {
            ptr = ini_msg.iniGetValue('MHSGateway', node + ".export_ptr", 0);
            return ptr;
            ini_msg.close();
        }


    } else {
        log(LOG_ERROR, "Can not get msgbase.cfg for " + area);
        return -1;
    }
}

function set_last_ptr(node, area, ptr) {


    log(LOG_DEBUG, format("Set last PTR to %s %s %d:", node, area, ptr));
    var msgbase = new MsgBase(area);

    if (msgbase.cfg) {

        ini_name = msgbase.cfg.data_dir + msgbase.cfg.code + ".ini";
        var ini_msg =  new File(ini_name);
        if (! ini_msg.open(ini_msg.exists ? 'r+':'w+')) {
            log(LOG_WARNING, "Error open .ini configuration for msgbase: " + ini_name);
            log(LOG_WARNING, "Asume first time run...");
            return false;
        }
        else {
            ini_msg.iniSetValue('MHSGateway', node + ".export_ptr", ptr);
            ini_msg.close();
            return true;
        }


    } else {
        log(LOG_ERROR, "Can not get msgbase.cfg for " + area);
        return false;
    }

}


// use to geenrate random filename
function makeid(length) {
   var result           = '';
   var characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

//Export process for all nodes -> areas
function export() {

    var nodes = load_nodes();
    var n; //index
    var node;  //name
    var n_description = "";
    var n_sendto = "";
    var n_active = "";
    var n_type = "";


    log(LOG_INFO, "Beging EXPORT");
    //loading globals

    var g_gateway_name = ini.iniGetValue('global', 'gateway_name', '');
    if (g_gateway_name == '') {
        log(LOG_ERROR, "ABORT! You must set the gateway_name config option to continue.");
        return -1;
    }
    for (n in nodes) {
        node = nodes[n];
        log(LOG_INFO, "Processing node: " + node);
        n_description = ini.iniGetValue('node:' + node, 'description', '<empty>');
        n_sendto = ini.iniGetValue('node:' + node, 'sendto', '');
        n_active = ini.iniGetValue('node:' + node, 'active', false);
        n_type = ini.iniGetValue('node:' + node, 'type', 'OTHER');
        log(LOG_INFO, "Description: " + n_description);

        if (!n_active) {
            log(LOG_WARNING, "This node is not acctive, skipping");
            continue;
        }

        //some checks
        switch (n_type.toUpperCase()) {
            case "MBBS":
            case "OTHER":
                break;
            default:
                log(LOG_WARNING, "Gateway type is unknown or not defined for node: " + node + " using OTHER");
                n_type = "OTHER";
        }
        log(LOG_INFO, "Gateway Type: " + n_type);

        if (! file_isdir(n_sendto)) {
            log(LOG_ERROR, "Path for SendTo do not exists..");
            log(LOG_INFO, "Try to create it!: " + n_sendto);
            if (mkpath(n_sendto)) {
                log(LOG_INFO, "Success!");
            } else {
                log(LOG_ERROR, "Can not create the SendTo directory.. skipping this node");
                continue;
            }
        }

        log(LOG_INFO, "Send To directory: " + n_sendto);

        //recurse areas
        log(LOG_INFO, "Process Areas for node " + node + "...");
        areas = load_areas(node);
        for (a in areas) {
            area = areas[a];
            log(LOG_INFO, "Area: " + area);
            a_active = ini.iniGetValue('area:' + node + ':' + area, 'active', true);
            if (!a_active) {
                log(LOG_WARNING, 'The area is not active for this node...skipping');
                continue;
            }

            a_import = ini.iniGetValue('area:' + node + ':' + area, 'import','');
            a_export = ini.iniGetValue('area:' + node + ':' + area, 'export','');

            //Get last exported ptr
            last_ptr = get_last_ptr(node, area);
            log(LOG_INFO, "Last PTR exported is " + last_ptr);

            var msgbase = new MsgBase(area);
            if (!msgbase.open()) {
                log(LOG_ERROR, "Error opening msgbase " + area + ": " + msgbase.error);
                log(LOG_ERROR, "Skipping area...");
                continue;
            } else {
                for (i = last_ptr +1; i <= msgbase.last_msg; i++) {
                    hdr = msgbase.get_msg_header(false, i);

                    //get some checks from newslink.js
                    if (hdr == null) {
                        log(LOG_ERROR, "failed to read msg header #" + i);
                        continue;
                    }

                    if (hdr.from_net_addr) {
                        log(LOG_DEBUG, hdr.from_net_addr);
                    }

                    if (!hdr.id) {
                        log(LOG_ERROR, "Message #" + i + " is missing a Message-ID header field");
                        continue;
                    }
                    if(hdr.attr&MSG_DELETE) { /* marked for deletion */
                        log(LOG_DEBUG, "skipping deleting msg #" + i);
                        continue;
                    }
                    if(hdr.attr&MSG_MODERATED && !(hdr.attr&MSG_VALIDATED)) {
                        log(LOG_DEBUG, "skipping at unvalidated moderated message: " + i);
                        continue;
                    }

                    if(hdr.attr&MSG_PRIVATE) { /* no private messages on MHS */
                        log(LOG_DEBUG, "skipping private msg #" + i);
                        continue;
                    }
                    log(LOG_DEBUG, format("#%d %s From: %s -> %s | %s" , i, hdr.date, hdr.from,  hdr.to, hdr.subject));

                    //Create te message
                    msg_out_filename = backslash(n_sendto) + makeid(8);
                    log(LOG_DEBUG, "Create file: " + msg_out_filename);
                    var msg_out = new File(msg_out_filename);
                    if (!msg_out.open("w")) {
                        log(LOG_ERROR, "Can not create output msg file: " + msg_out_filename);
                        continue;
                    }
                    msg_out.printf("From: %s @ %s\r\n", hdr.from, g_gateway_name);
                    msg_out.printf("To: %s @ MBBS { MBBS: %s}\r\n", a_export, a_export);
                    msg_out.printf("Subject: %s\r\n", hdr.subject);
                    msg_out.printf("Summary: MBBS: %s\r\n", hdr.to);
                    msg_out.printf("Date: %s\r\n", hdr.date);
                    msg_out.printf("\r\n", hdr.date);
                    msg_out.printf("@DATE: %s\r\n", hdr.date);
                    body = msgbase.get_msg_body(i);
                    msg_out.write(body);

                    msg_out.close();
                    set_last_ptr(node, area, i);


                }

            }


        }

    }


}

var ini = new File(system.ctrl_dir + "mhsgate.ini");


function main() {

    log(LOG_INFO, "Starting MHSGateway v" + MHSGATEWAY_VERSION);
    if(!js.global.bbs) {
        log(LOG_WARNING, "Running as standalone process");
    }

    if (! ini.open('r')) {
        log(LOG_ERROR, "Error open .ini configuration file: " + ini.name);
        exit(1);
    }

    export();
    //import();

}

main()
ini.close();

