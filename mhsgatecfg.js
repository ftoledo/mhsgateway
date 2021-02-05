load("uifcdefs.js");
load("sbbsdefs.js");
"use strict";

const MHSGATEWAY_VERSION = "1.0";

const GW_MODE_BAD = 0; // mark a .BAD file if not for our gateway
const GW_MODE_SKIP = 1; // skip file if the msg is not for our gateway (no delete it)
const GW_MODE_ROUTE = 2; // try to route to another MHS configured nodes
const GW_MODE_DELETE = 3; // silent delete the msg file for uwnknown destination (!DANGEROUS?)

var GW_MODES = [];
GW_MODES[GW_MODE_BAD] = 'Mark as BAD';
GW_MODES[GW_MODE_SKIP] = 'Skip it';
GW_MODES[GW_MODE_ROUTE] = 'Route To Nodes';
GW_MODES[GW_MODE_DELETE] = 'Delete it';

// Backward compatability hack.
if (typeof uifc.list.CTX === "undefined") {
    uifc.list.CTX = function () {
        this.cur = 0;
        this.bar = 0;
    }
}

uifc.init("MHS Gateway to WG");
js.on_exit("uifc.bail();");

function cfg_globals(){

    var cmd = 0;
    var ctx_globals = new uifc.list.CTX();
    uifc.help_text = help("globals");
    while(cmd >= 0) {
        var menu = [
            format("%-20s %s", "Gateway Name", ini.iniGetValue('global', 'gateway_name'))
        ];

        cmd = uifc.list(WIN_ORG|WIN_ACT|WIN_MID|WIN_ESC, "Global Options", menu, ctx_globals);
        switch(cmd) {
            case 0:
                uifc.help_text = help('gateway_name');
                var val = ini.iniGetValue('global','gateway_name','');
                var tmp = uifc.input(WIN_MID|WIN_SAV,'Gateway Name',val,50, K_EDIT);
                if (tmp !== undefined ) {
                    ini.iniSetValue('global','gateway_name', tmp);
                }
                break;
            case -1:
                //exit
                break;
            default:
                uifc.msg("Unhandled Return: "+cmd);
                break;
        }
    }
}

function cfg_area(area) {
    var ctx_area = new uifc.list.CTX();
    var cmd = 0;
    var menu_fmt = "%-20s %s";
    uifc.help_text = help('area');
    while(cmd >= 0) {
        var menu = [

            format(menu_fmt, "Import Address", ini.iniGetValue('area:'+area,'import')),
            format(menu_fmt, "Export Address", ini.iniGetValue('area:'+area,'export')),
            format(menu_fmt, "Active",ini.iniGetValue('area:'+area,'active'))
        ];
        cmd = uifc.list(WIN_ACT|WIN_MID|WIN_ESC, "Area config: " + area, menu, ctx_area);
        switch(cmd) {
            case 0:
                //import
                var val = ini.iniGetValue('area:'+area,'import','');
                var tmp = uifc.input(WIN_MID|WIN_SAV,'Import Address',val,50, K_EDIT);
                if (tmp !== undefined ) {
                    ini.iniSetValue('area:'+area,'import', tmp);
                }
                break;
            case 1:
                //export
                var val = ini.iniGetValue('area:'+area,'export','');
                var tmp = uifc.input(WIN_MID|WIN_SAV,'Export Address',val,50, K_EDIT);
                if (tmp !== undefined ) {
                    ini.iniSetValue('area:'+area,'export', tmp);
                }
                break;
            case 2:

                switch(uifc.list(WIN_MID|WIN_SAV, "Active", ["Yes", "No"])) {
                    case 0:
                        ini.iniSetValue('area:'+area,'active', true);
                        break;
                    case 1:
                        ini.iniSetValue('area:'+area,'active', false);
                        break;
                }
            case -1:
                //exit
                break;
            default:
                uifc.msg("Unhandled Return: "+cmd);
                break;
        }
    }

}
function del_area(node, area) {
    area = area.toUpperCase();
    node = node.toUpperCase();
    ini.iniRemoveSection("area:" + node + ':' + area);
}

function add_area(node, area) {
    area = sanitized(area);
    area = area.toUpperCase();

    node = sanitized(node);
    node = node.toUpperCase();


    ini.iniSetValue("area:" + node + ":" + area, "import",'');
    ini.iniSetValue("area:" + node + ":" + area, "export",'');
    ini.iniSetValue("area:" + node + ":" + area, "created",strftime("%d-%m-%Y %H:%M:%S"));
    ini.iniSetValue("area:" + node + ":" + area, "active",true);
}

function cfg_areas(node) {
    var area = 0;
    var tmp;
    var ctx_areas = new uifc.list.CTX();

    while(area >= 0) {

        var areas_list = [];
        var areas;
        var menu = [];
        var inactive = "";

        areas = ini.iniGetSections("area:" + node + ":");

        for (a in areas) {
             areas_list.push(areas[a].slice(5).toUpperCase());

             if (ini.iniGetValue(areas[a],'active') != true) {
                inactive = "Inactive";
             }
             else {
                inactive = "";
             }
             menu.push(format("%-20s | %-20s | %-20s | %-20s",
                areas[a].slice(5),
                ini.iniGetValue(areas[a],'import'),
                ini.iniGetValue(areas[a],'export'),
                inactive
                ));
        }
        //menu = menu.map(function(v){return v.toUpperCase();});
        area = uifc.list(WIN_SAV|WIN_ACT|WIN_DEL|WIN_INS, "Select Area (SBBS internal code | MHS From | MHS To)", menu, ctx_areas);
        if (area == -1) {
            break;
        }
        else if (area == areas.length || (area & MSK_INS) == MSK_INS) {
            area &= MSK_OFF;
            tmp = pick_area();
            if ((tmp !== undefined) && (tmp != "")) {
                add_area(node, tmp);
                cfg_areas(node);
            }
            break;
        }
        else if ((area & MSK_DEL) == MSK_DEL) {
            area &= MSK_OFF;
            if (areas_list[area] != undefined){


                if (confirm("Delete area " + areas_list[area].slice(node.length+1) + "?", true, ctx_areas)) {
                    del_area(node, areas_list[area].slice(node.length+1));
                }
            }
        }
        else {
            cfg_area(areas_list[area]);
        }
    }
}

function cfg_node(node, ctx_node) {
    var cmd = 0;
    var menu_fmt = "%-20s %s";
    uifc.help_text = help('paths');
    total_areas = count_areas(node);
    while(cmd >= 0) {
        var menu = [

            format(menu_fmt, "Description", ini.iniGetValue('node:'+node,'description')),
            format(menu_fmt, "Pickup From", ini.iniGetValue('node:'+node,'pickup')),
            format(menu_fmt, "Send To",ini.iniGetValue('node:'+node,'sendto')),
            format(menu_fmt, "Type",ini.iniGetValue('node:'+node,'type')),
            format(menu_fmt, "GW Mode",GW_MODES[ini.iniGetValue('node:'+node,'gw_mode')]),
            format(menu_fmt, "Linked Areas","Active: " + total_areas),
            format(menu_fmt, "Active",ini.iniGetValue('node:'+node,'active'))
        ];
        cmd = uifc.list(WIN_SAV|WIN_ACT|WIN_MID|WIN_ESC, "Node config: " + node, menu, ctx_node);
        switch(cmd) {
            case 0:
                var val = ini.iniGetValue('node:'+node,'description','');
                tmp = uifc.input(WIN_MID|WIN_SAV,'Description',val,1024, K_EDIT);
                if (tmp !== undefined) {
                    ini.iniSetValue('node:'+node,'description', tmp);
                }
                break;
            case 1:
                var val = ini.iniGetValue('node:' + node ,'pickup','');
                tmp = uifc.input(WIN_MID|WIN_SAV,'Pickup from directory',val,1024, K_EDIT);
                if (tmp !== undefined) {
                    ini.iniSetValue('node:'+node,'pickup', tmp);
                }
                break;
            case 2:
                var val = ini.iniGetValue('node:'+node,'sendto','');
                tmp = uifc.input(WIN_MID|WIN_SAV,'Sent to directory',val,1024, K_EDIT);
                if (tmp !== undefined) {
                    ini.iniSetValue('node:'+node,'sendto', tmp);
                }
                break;
            case 3:
                uifc.help_text = help('type_of_gateway');
                switch(uifc.list(WIN_MID|WIN_SAV, "Type", ["MBBS", "OTHER"])) {
                    case 0:
                        ini.iniSetValue('node:'+node,'type', "MBBS");
                        break;
                    case 1:
                        ini.iniSetValue('node:'+node,'type', "OTHER");
                        break;
                }
                break;
            case 4:
                n_gw_mode = uifc.list(WIN_MID|WIN_SAV, "Gateway Mode", GW_MODES);
                if (n_gw_mode != -1 ) {
                    ini.iniSetValue('node:'+node,'gw_mode', n_gw_mode);
                }
                break;
            case 5:
                uifc.help_text = help('linked_areas');
                cfg_areas(node);
                break;
            case 6:
                switch(uifc.list(WIN_MID|WIN_SAV, "Active", ["Yes", "No"])) {
                    case 0:
                        ini.iniSetValue('node:'+node,'active', true);
                        break;
                    case 1:
                        ini.iniSetValue('node:'+node,'active', false);
                        break;
                }
                break;
                //var val = ini.iniGetValue('node:'+node,'active',true);
            case -1:
                //exit
                break;
            default:
                uifc.msg("Unhandled Return: "+cmd);
                break;
        }
    }
}

function add_node(node) {
    node = sanitized(node);
    node = node.toUpperCase();
    ini.iniSetValue("node:" + node, "description",'');
    ini.iniSetValue("node:" + node, "created",strftime("%d-%m-%Y %H:%M:%S"));
    ini.iniSetValue("node:" + node, "active",true);
}

function del_node(node) {
    ini.iniRemoveSection("node:"+node);
}

function cfg_nodes() {
    var node = 0;
    var tmp;
    var ctx_nodes = new uifc.list.CTX();
    uifc.help_text = help("nodes");
    while(node >= 0) {

        var nodes_list = [];
        var menu = [];
        var nodes;
        nodes = ini.iniGetSections("node:");
        for (n in nodes) {
             menu.push(format("%-20s %s", nodes[n].slice(5).toUpperCase(), '|' + ini.iniGetValue(nodes[n], 'description')));
             nodes_list.push(nodes[n].slice(5));
        }

        node = uifc.list(WIN_SAV|WIN_ACT|WIN_DEL|WIN_INS|WIN_DELACT|WIN_EDIT, "Select Node", menu, ctx_nodes);
        if (node == -1) {
            break;
        }
        else if (node == nodes.length || (node & MSK_INS) == MSK_INS) {
            node &= MSK_OFF;
            tmp = uifc.input(WIN_SAV|WIN_MID, "New Node name", 30);
            if ((tmp !== undefined) && (tmp != "")) {
                add_node(tmp);
            }
            break;
        }
        else if ((node & MSK_EDIT) == MSK_EDIT) {
            node &= MSK_OFF;
            tmp = uifc.input(WIN_SAV|WIN_MID, "Rename Node", nodes_list[node], 30, K_EDIT);
            if ((tmp !== undefined) && (tmp != "")) {
                rename_node(nodes_list[node], tmp);
            }

        }
        else if ((node & MSK_DEL) == MSK_DEL) {

            node &= MSK_OFF;
            if (nodes_list[node] != undefined) {
                if (confirm("Delete node and asociated areas? (WARNING: This is not reversible!!!", false)) {
                    del_node(nodes_list[node]);
                }
            }
        }
        else {
            cfg_node(nodes_list[parseInt(node)], ctx_nodes);
        }
    }
}


function main() {


    var cmd = 0;
    var ctx_main = new uifc.list.CTX();

    while(cmd >= 0) {
        uifc.help_text = help("main");
        var menu = ["Global Options","MHS Nodes"];
        cmd = uifc.list(WIN_ORG|WIN_ACT|WIN_MID|WIN_ESC, "MSH Gateway Options", menu, ctx_main);
        switch(cmd) {
            case 0:
                cfg_globals();
                break;
            case 1:
                cfg_nodes();
                break;
            case -1:
                //exit
                return;
                break;
            default:
                uifc.msg("Unhandled Return: "+cmd);
                break;
        }
    }

    uifc.bail();

}

/**
 * fix : for names using at ini sections namespaces like [node:node_name] and
 * prevent [node:node:name]
 */
function sanitized(n) {
    var re = new RegExp(':','g');
    return n.replace(re,'_');
}

function pick_area()
{
    var cmd = 0;
    var grps = Object.keys(msg_area.grp);
    var areas;
    var areacodes;
    var area;
    var ctx_pick_area = new uifc.list.CTX();
    var dctx;
    var i;

    while (cmd >= 0) {
        cmd = uifc.list(WIN_SAV|WIN_RHT, "Select Group" , grps, ctx_pick_area);
        if (cmd >= 0) {
            dctx_pic_area = new uifc.list.CTX();
            areacodes = msg_area.grp[grps[cmd]].sub_list.map(function(v){return v.code;});
            areas = areacodes.map(function(v){return msg_area.sub[v].name;});

            sub = uifc.list(WIN_SAV|WIN_BOT, "Select Sub", areas, dctx_pic_area);
            if (sub >= 0) {
                return areacodes[sub];
            }
        }
    }
    return undefined;
}

function pick_node()
{
    var cmd = 0;
    var nodes = [];
    var ctx_pick_node = new uifc.list.CTX();

    nodes = ini.iniGetSections("node:");
    for (n in nodes) {
         menu.push(format(menu_fmt, nodes[n].slice(5).toUpperCase(), '|' + ini.iniGetValue(nodes[n], 'description')));
         nodes_list.push(nodes[n].slice(5));
    }

    node = uifc.list(WIN_SAV|WIN_ACT|WIN_DEL|WIN_INS|WIN_DELACT, "Select Node", nodes, ctx_pick_node);

    if (sub >= 0) {
        return node;
    }
    return undefined;
}

/**
 * Count the active linked areas configured at node
 */
function count_areas(node) {
    areas = ini.iniGetSections("area:" + node + ":");
    var c = 0;
    for (a in areas) {
        if (ini.iniGetValue(areas[a], 'active') == true) {
            c++;
        }
    }

    return c;
}


/**
 * Rename the node (recursive areas)
 */
function rename_node(old_name, new_name) {
    var areas;
    var area;

    //Create node
    add_node(new_name);

    //set old values to new node
    ini.iniSetValue('node:' + new_name, 'description', ini.iniGetValue('node:' + old_name, 'description'));
    ini.iniSetValue('node:' + new_name, 'created', ini.iniGetValue('node:' + old_name, 'created'));
    ini.iniSetValue('node:' + new_name, 'active', ini.iniGetValue('node:' + old_name, 'active'));
    ini.iniSetValue('node:' + new_name, 'pickup', ini.iniGetValue('node:' + old_name, 'pickup'));
    ini.iniSetValue('node:' + new_name, 'sendto', ini.iniGetValue('node:' + old_name, 'sendto'));
    ini.iniSetValue('node:' + new_name, 'type', ini.iniGetValue('node:' + old_name, 'type'));
    ini.iniSetValue('node:' + new_name, 'gw_mode', ini.iniGetValue('node:' + old_name, 'gw_mode', GW_MODE_BAD));

    areas = ini.iniGetSections("area:" + old_name + ":");
    slice_string = "area:" + old_name + ":";

    for (a in areas) {
        area = areas[a].slice(slice_string.length).toUpperCase();
        //Create area
        add_area(new_name, area);
        //Set old areas value
        ini.iniSetValue('area:' + new_name + ":" + area,'import', ini.iniGetValue(areas[a],'import'));
        ini.iniSetValue('area:' + new_name + ":" + area,'export', ini.iniGetValue(areas[a],'export'));
        ini.iniSetValue('area:' + new_name + ":" + area,'created', ini.iniGetValue(areas[a],'created'));
        ini.iniSetValue('area:' + new_name + ":" + area,'active', ini.iniGetValue(areas[a],'active'));
        //Remove old area
        ini.iniRemoveSection(areas[a]);
    }
    // Remove old node
    del_node(old_name);
}
function confirm (msg, default_yes, ctx) {

 var cmd = 0;

    while(cmd >= 0) {
        var menu = ["Yes","No"];

        cmd = uifc.list(WIN_SAV|WIN_MID|WIN_ESC, msg, menu, ctx);
        switch(cmd) {
            case 0:
                return true;
                break;
            case 1:
                return false;
                break;
            case -1:
                //exit
                return false;
                break;
            default:
                uifc.msg("Unhandled Return: "+cmd);
                return false;
                break;
        }
    }

}
function help(item) {
    var str;
    switch (item) {
        case 'main':
            str = "Setup MHSGateway v" + MHSGATEWAY_VERSION + ")";
            break;
        case 'gateway_name':
            str = "Name for `this` MHS gateway";
            break;
        case 'paths':
            str = "Setup settings and paths for the gateway node\n\n";
            str += "\1Pickup from\1\n\nThis is the directory that MHSGate will \1pickup\1 messages.\n";
            str += "Verify that will be the same value as OUTMSG (WG side Level 4 config option)";
            str += "\n\n";
            str += "\1Sent to\1\n\nThis is the directory that MHSGate will \1send\1 messages.\n";
            str += "Verify that will be the same value as INMSG (WG side Level 4 config option)";
            str += "\n\n";
            str += "\1Type\1\n\nType of remote system (for some quirks)\n";
            str += "\n\n";
            str += "\1Gateway Mode\1\n\nBehavior for this node on unknown destination adresses.\n\n";
            str += "Action to take when message are import with unknown detination address: \n\n";
            str += "Possible modes: \n\n";
            str += "    \1Mark as BAD:\1 the message will rename with .BAD extension\n";
            str += "    \1Skip:\1 The mssage file will skipped (dont touched)\n";
            str += "    \1Route:\1 check for domain of another configured nodes and try to deliver to them\n";
            str += "    \1Delete:\1 Delete the message for unknown destinations (warning! you lost it)\n";
            str += "\n\n";
            str += "\1Linked Areas\1\n\nSetup the areas to import/export.\n";
            str += "\n\n";
            str += "\1Active\1\n\nEnable / Disable node processing.\n";

            break;
        case 'type_of_gateway':
            str = "Type of supported gateways\n\n";
            str += "Select \1MBBS\1 for MajorBBS/Worldgroup, \1OTHER\1 for unsupported";
            break;
        case 'linked_areas':
            str = "Setup linked areas between your host and remote system.\n";
            str += "You must add every area that wish share with the remote system.\n\n";
            break;
        case 'area':
            str = "Linked Area Settings\n\n";
            str += "\1Area name\1\n\n";
            str += "This is the internal SBBS area code.";
            str += "\n\n";
            str += "\1Import name\1 \n\n";
            str += "SBBS will import the messages come From this address (ex: sysopsgeneral@dovenet).";
            str += "\n\n";
            str += "\1Export name\1 \n\n";
            str += "This is the address that SBBS will export to remote system (on Wrolgroup can be /hello).";
            str += "\n\n";
            str += "\1Enabled\1 \n\n";
            str += "If set to false, this area will be skipped on import/export process.";
            str += "\n\n";
            break;
        case 'nodes':
            str = "List of linked Nodes (Remote Systems)\n\n";
            break;
        case 'globals':
            str = "Global settings for MHSGateway\n\n";
            str += "This are general settings to run the MHS Gateway";
            break;

        default:
            log(LOG_WARNING, "Help text not defined for : " + item);
            uifc.msg("Help text not define for: "+ item);
            str = '';
    }
    return str;
}

var ini = new File(system.ctrl_dir + "mhsgate.ini");

if (! ini.open(ini.exists ? 'r+':'w+')) {
    uifc.msg("Error on open .ini file: " + ini.name);
    uifc.bail();
    exit(1);
}

main();
ini.close();
