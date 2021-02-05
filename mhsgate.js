load("smbdefs.js");
const MHSGATEWAY_VERSION = '1.0';
"use strict";

// Mode behavior when import message for another MHS domain (gateway name)

const GW_MODE_BAD = 0; // mark a .BAD file if not for our gateway
const GW_MODE_SKIP = 1; // skip file if the msg is not for our gateway (no delete it)
const GW_MODE_ROUTE = 2; // try to route to another MHS configured nodes
const GW_MODE_DELETE = 3; // silent delete the msg file for uwnknown destination (!DANGEROUS?)

var GW_MODES = [];
GW_MODES[GW_MODE_BAD] = 'Mark as BAD';
GW_MODES[GW_MODE_SKIP] = 'Skip it';
GW_MODES[GW_MODE_ROUTE] = 'Route To Nodes';
GW_MODES[GW_MODE_DELETE] = 'Delete it';

/**
 * Parse headers and return array
 * @context: import
 */
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
        log(LOG_DEBUG, format("hdr.%s: %s", field, value));
        hdr[field] = value;

        headers = hdr;

    }
    return headers;
}

/**
 * Get user@domain for mhs from header
 * @context: import
 */
function format_mhs_from_addr(from) {
    part = from.indexOf(' ');
    domain = from.slice(0,part).trim();
    domain = domain.split('@');
    domtext = domain[1];
    name = from.slice(part).trim();
    name = name.split(' ');
    nametext = name[1].slice(0,name[1].length-1).trim();

    return nametext + '@' + domtext;

}

/**
 * Get domain for mhs from header
 * @context: import
 */
function format_mhs_domain_addr(from) {
    part = from.indexOf(' ');
    domain = from.slice(0,part).trim();
    domain = domain.split('@');
    domtext = domain[1];

    return domtext;

}



/**
 * Read mhs file body and return as array of lines
 * @context: import
 */
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

/**
 * Rename file as .BAD
 * @context: import
 */
function mark_as_bad(file) {
    log(LOG_INFO, "Mark as bad file: " + file);
    file_rename(file, file + ".BAD");
}

/**
 *  load nodes as array
 */
function load_nodes() {

    var ini_nodes = ini.iniGetSections('node:');
    var nodes = [];
    var n;

    for (n in ini_nodes) {
        nodes.push(ini_nodes[n].slice(5));
    }
    return nodes;
}

/**
 * load areas of node as array
 */
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

/**
 * Get the last prt exported from node/area pair
 * this use the sub ini file in data/subs directory
 * @return int pointer value
 */
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

/**
 * Set the last pointer for NODE.export_prt
 * on the sub.ini file
 */
function set_last_ptr(node, area, ptr) {

    log(LOG_DEBUG, format("Set last PTR to %s %s %d", node, area, ptr));
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

/**
 * Use to generate random filename
 * @context: export
 */
function makeid(length) {
   var result           = '';
   var characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

/**
 * Export process for all nodes -> areas
 * Read each sub for each node and export the messages
 * the pointer will save into sub.ini files
 */
function export() {

    var nodes = load_nodes();
    var n; //index
    var node;  //name
    var n_description = "";
    var n_sendto = "";
    var n_active = "";
    var n_type = "";

    log(LOG_INFO, "Beging EXPORT");

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

                    //check if same net orgin
                    if (hdr.from_net_type == NET_MHS) {
                        log(LOG_DEBUG, "From net type: " + hdr.from_net_type);
                        if (hdr.from_net_addr) {
                            log(LOG_DEBUG, "From net addr: " + hdr.from_net_addr);
                            if (hdr.from_net_addr.toLowerCase() == node.toLowerCase()) {
                                log(LOG_DEBUG, "Skip same origin address message #" + i);
                                continue;
                            }
                        }

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
                    msg_out.printf("To: %s @ MBBS { MBBS: %s }\r\n", a_export, a_export);
                    msg_out.printf("Subject: %s\r\n", hdr.subject);
                    msg_out.printf("Summary: MBBS: %s\r\n", hdr.to);
                    msg_out.printf("Date: %s\r\n", strftime("%m/%d/%Y %H:%M:%S"));
                    msg_out.printf("\r\n", hdr.date);
                    msg_out.printf("@DATE: %s\r\n", hdr.date);
                    body = msgbase.get_msg_body(i, false, true);
                    msg_out.write(body);

                    msg_out.close();
                    set_last_ptr(node, area, i);


                }
            }
        }
    }
}

/**
 * Import message for each node, parse it and insert into sub msgbase file
 */
function import() {

    log(LOG_INFO, "Begin IMPORT...");

    // load nodes
    var nodes = load_nodes();

    // pickup each node
    for (n in nodes) {

        node = nodes[n];
        log(LOG_INFO, "Processing node: " + node);
        n_description = ini.iniGetValue('node:' + node, 'description', '<empty>');
        n_pickup = ini.iniGetValue('node:' + node, 'pickup', '');
        n_active = ini.iniGetValue('node:' + node, 'active', false);
        n_type = ini.iniGetValue('node:' + node, 'type', 'OTHER');
        n_gw_mode = ini.iniGetValue('node:' + node, 'gw_mode', 0);
        log(LOG_INFO, "Description: " + n_description);

        if (!n_active) {
            log(LOG_WARNING, "This node is not acctive, skipping");
            continue;
        }

        if (n_gw_mode < 0 || n_gw_mode > 3) {
            log(LOG_ERROR,format("!Unknown gateway mode for this node: %s using default", n_gw_mode));
            n_gw_mode = GW_MODE_BAD;
        }

        log(LOG_INFO, format("Action to unknown destinations: %s", GW_MODES[n_gw_mode]));

        log(LOG_INFO, "Scanning node: " + node);
        var files = [];
        files = directory(backslash(n_pickup) + "*");
        for (var f in files) {

            var f_name = files[f];
            //skip directories
            if (file_isdir(f_name))
                continue;

            if (f_name.toLowerCase().slice(-3) == "bad") {
                log(LOG_INFO, "Skip bad file: " + f_name);
                continue;
            }

            log(LOG_INFO, "** Processing: " + f_name);
            var fp = new File(f_name);
            if (! fp.open("r")) {
                log(LOG_INFO, "Can't open file: " + f_name);
            } else {
                var msg = [];
                var msg = fp.readAll();
                fp.close();
                header = parse_header(msg);
                body = parse_body(msg);

                //validations
                if (header['SMF-70'] == undefined){
                    log(LOG_WARNING, "No SMF-70 header found");
                    mark_as_bad(f_name);
                    continue;
                }

                //is for my?
                dest = header['to'].split('@');
                if (dest[1].toLowerCase() != g_gateway_name.toLowerCase()) {
                    log(LOG_WARNING, format("Destination domain !unknown: %s",header['to']));
                    switch(n_gw_mode) {
                        case GW_MODE_SKIP:
                            log(LOG_WARNING, format("Skiping file %s", f_name));
                            continue;
                            break;
                        case GW_MODE_DELETE:
                            log(LOG_WARNING, format("Will deleting file %s", f_name));
                            if(!fp.remove()) {
                                log(LOG_ERROR, format("Cannot delete %s",f_name));
                            }
                            continue;
                            break;
                        case GW_MODE_BAD:
                            log(LOG_WARNING, format("Mark as .BAD: %s",f_name));
                            mark_as_bad(f_name)
                            continue;
                        default:
                           break;
                    }
                }
                else {
                    //message is for us
                    log(LOG_DEBUG, format("Match destination domain %s", dest[1]));
                    areas = load_areas(node);

                    var found = false;
                    for(a in areas) {
                        area = areas[a];

                        a_active = ini.iniGetValue('area:' + node + ':' + area, 'active', true);
                        if (!a_active) {
                            log(LOG_WARNING, 'The area is not active for this node...skipping');
                            continue;
                        }

                        a_import = ini.iniGetValue('area:' + node + ':' + area, 'import','');

                        log(LOG_DEBUG,format("Check To: %s, for area %s", header['to'], a_import ));
                        if(dest[0].toLowerCase() == a_import.toLowerCase()) {
                            log(LOG_DEBUG, "Match Found!");
                            found = true;
                            break;
                        }
                    }

                    if (found) {
                        //import the message
                        var msgbase = new MsgBase(area);
                        if (msgbase.open()) {
                            var newhdr = {
                                to: 'All',
                                from: format_mhs_from_addr(header['from']),
                                subject: header['subject'].trim(),
                                from_agent: AGENT_PROCESS,
                                from_net_type: NET_MHS,
                                from_net_addr: format_mhs_domain_addr(header['from']),
                                summary: header['from'],
                                tags: 'MHS-Imported MHS-From-' + dest[1]
                            };
                            if (header['summary']) {
                                log(LOG_DEBUG, format("Summary detected: %s", header['summary']));
                                var toaddr = header['summary'].split(':');
                                newhdr.to = toaddr[1].trim();
                                log(LOG_DEBUG, format("Using %s instead of All", newhdr.to));
                            }
                            var newbody = body.join("\n");

                            if (msgbase.save_msg(newhdr, newbody)) {
                                log(LOG_INFO, "Message Saved!");
                                if (f_name.toLowerCase().slice(-5) == 'nodel') {
                                    log(LOG_INFO, "Skip .nodel test file");
                                }
                               else {
                                    log(LOG_DEBUG, "Remove file: "+ f_name);
                                    if (file_remove(f_name)) {
                                        log(LOG_INFO, "File removed: " + f_name);
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
                            log(LOG_ERROR, "Cannot open msgbase(" + msgbase.last_error+"): " + area );
                            continue;
                        }
                    }
                    else {
                        log(LOG_WARNING, "Destination area not found: " + header['to']);
                    } //if found
                } // message fo us
            } //if open file
        } //for each files
    } //for each node
}

/**
 * Global assets
 */
var ini = new File(system.ctrl_dir + "mhsgate.ini");
var g_gateway_name = '';

/**
 * Main entry point
 */
function main() {

    log(LOG_INFO, "Starting MHSGateway v" + MHSGATEWAY_VERSION);
    if(!js.global.bbs) {
        log(LOG_WARNING, "Running as standalone process");
    }

    if (! ini.open('r')) {
        log(LOG_ERROR, "Error open .ini configuration file: " + ini.name);
        exit(1);
    }

    g_gateway_name = ini.iniGetValue('global', 'gateway_name', '');
    if (g_gateway_name == '') {
        log(LOG_ERROR, "ABORT! You must set the gateway_name config option to continue.");
        return -1;
    }

    export();
    import();
}

main()
ini.close();

