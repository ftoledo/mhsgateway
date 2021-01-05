load("uifcdefs.js");
load("sbbsdefs.js");

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

            format(menu_fmt, "Target", ini.iniGetValue('area:'+area,'target')),
            format(menu_fmt, "Nodes", ini.iniGetValue('area:'+area,'nodes')),
            format(menu_fmt, "Active",ini.iniGetValue('area:'+area,'active'))
        ];
        cmd = uifc.list(WIN_ORG|WIN_ACT|WIN_MID|WIN_ESC, "Area config: " + area, menu, ctx_area);
        switch(cmd) {
            case 0:

                sub = pick_area();
                if (sub !== undefined) {
                    ini.iniSetValue('area:'+area,'target', sub);
                }
                cmd = 0;
                break;
            case 1:
                //TODO Pick Nodes
                var val = ini.iniGetValue('area:'+area,'nodes','');
                tmp = uifc.input(WIN_MID|WIN_SAV,'Nodes (coma separated)',val,1024, K_EDIT);
                if (tmp !== undefined) {
                    ini.iniSetValue('area:'+area,'nodes', tmp);
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
function del_area(area) {
    area = area.toUpperCase();
    ini.iniRemoveSection("area:" + area);
}

function add_area(node, area) {
    area = sanitized(area);
    area = area.toUpperCase();
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
        area = uifc.list(WIN_SAV|WIN_ACT|WIN_DEL|WIN_INS|WIN_DELACT, "Select Area (SBB internal code | MHS From | MHS To)", menu, ctx_areas);
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
        else if (area & MSK_DEL) {
            area &= MSK_OFF;
            del_area(areas_list[area]);
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
            format(menu_fmt, "Linked Areas","Active:" + total_areas),
            format(menu_fmt, "Active",ini.iniGetValue('node:'+node,'active'))
        ];
        cmd = uifc.list(WIN_ORG|WIN_ACT|WIN_MID|WIN_ESC, "Node config: " + node, menu, ctx_node);
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
                uifc.help_text = help('linked_areas');
                cfg_areas(node);
                break;
            case 5:
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
    uifc.msg("Delete");
    ini.iniRemoveSection("node:"+node);
}

function cfg_nodes() {
    var node = 0;
    var tmp;
    var ctx_nodes = new uifc.list.CTX();

    while(node >= 0) {

        var nodes_list = [];
        var menu = [];
        var nodes;
        nodes = ini.iniGetSections("node:");
        for (n in nodes) {
             menu.push(format("%-20s %s", nodes[n].slice(5).toUpperCase(), '|' + ini.iniGetValue(nodes[n], 'description')));
             nodes_list.push(nodes[n].slice(5));
        }

        node = uifc.list(WIN_SAV|WIN_ACT|WIN_DEL|WIN_INS|WIN_DELACT, "Select Node", menu, ctx_nodes);
        if (node == -1) {
            break;
        }
        else if (node == nodes.length || (node & MSK_INS) == MSK_INS) {
            node &= MSK_OFF;
            tmp = uifc.input(WIN_SAV|WIN_MID, "Node", 30);
            if ((tmp !== undefined) && (tmp != "")) {
                add_node(tmp);
            }
            break;
        }
        else if (node & MSK_DEL) {
            node &= MSK_OFF;
            del_node(nodes_list[node]);
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
        cmd = uifc.list(WIN_SAV|WIN_ACT|WIN_RHT, "Select Group" , grps, ctx_pick_area);
        if (cmd >= 0) {
            dctx_pic_area = new uifc.list.CTX();
            areacodes = msg_area.grp[grps[cmd]].sub_list.map(function(v){return v.code;});
            areas = areacodes.map(function(v){return msg_area.sub[v].name;});

            sub = uifc.list(WIN_SAV|WIN_ACT|WIN_BOT, "Select Sub", areas, dctx_pic_area);
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

function help(item) {
    var str;
    switch (item) {
        case 'main':
            str = "Global configurations";
            break;
        case 'gateway_name':
            str = "Name for `this` MHS gateway";
            break;
        case 'paths':
            str = "Setup the paths for the gateway\n\n";
            str += "\1Pickup from\1\n\nThis is the directory that MHSGate will \1pickup\1 messages.\n";
            str += "Verify that will be the same value as OUTMSG (WG side Level 4 config option)";
            str += "\n\n";
            str += "\1Sent to\1\n\nThis is the directory that MHSGate will \1send\1 messages.\n";
            str += "Verify that will be the same value as INMSG (WG side Level 4 config option)";
            break;
        case 'type_of_gateway':
            str = "Type of supported gateways\n\n";
            str += "Select \1MBBS\1 for MajorBBS/Worldgroup, \1OTHER\1 for unsupported";
            break;
        case 'linked_areas':
            str = "Setup linked areas between your host and remote system.\n";
            str += "You must add every area that wish share with the remote system.\n\n";
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

        default:
            log(LOG_WARNING, "Help text not defined for : " + item);
            uifc.msg("Help text not define for: "+ item);
            str = 'No help text defined';
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
