var app = require("app"); // Module to control application life.
var dialog = require("dialog");
var fs = require("fs-extra");
var ipc = require("ipc");
var os = require("os");
var path = require("path");

var child_process = require("child_process");

var BrowserWindow = require("browser-window");

var mainWindow = null;
var hasExecuted = false;

var unityHomeDir = path.join(__dirname, "../../WebPlayer");

// If running in non-packaged / development mode, this dir will be slightly different
if (process.env.npm_node_execpath) {
    unityHomeDir = path.join(app.getAppPath(), "/build/WebPlayer");
}

process.env["UNITY_HOME_DIR"] = unityHomeDir;
process.env["UNITY_DISABLE_PLUGIN_UPDATES"] = "yes";

app.commandLine.appendSwitch("enable-npapi");

var plugin = path.join(unityHomeDir, "/loader/npUnity3D32.dll");

app.commandLine.appendSwitch("load-plugin", plugin);

console.log("Plugin url: " + plugin);

app.commandLine.appendSwitch("no-proxy-server");

var userData = app.getPath("userData");
var serversPath = path.join(userData, "servers.json");
var configPath = path.join(userData, "config.json");

function isUnityWebPlayerInstalled(cb) {
    // Check if Unity Web Player is installed by looking for a key file in the install directory
    var unityPlayerPath = path.join(
        unityHomeDir,
        "player",
        "3.x.x",
        "webplayer_win.dll"
    );
    var installed = fs.existsSync(unityPlayerPath);
    cb(installed);
}

function installWebPlayer(executablePath, args) {
    isUnityWebPlayerInstalled(function (installed) {
        if (installed) {
            console.log(
                "Unity Web Player is already installed, skipping install."
            );
            if (cb) cb(null);
            return;
        }
        if (!args) args = [];
        var appProcess = child_process.spawn(executablePath, args, {
            detached: true,
            stdio: "ignore",
        });
        appProcess.on("error", function (err) {
            console.error("Failed to install webplayer:", err);
        });
        appProcess.unref();
        console.log("Installed webplayer!");
    });
}

function initialSetup() {
    if (!fs.existsSync(configPath))
        fs.copySync(path.join(__dirname, "/defaults/config.json"), configPath);
    if (!fs.existsSync(serversPath))
        fs.copySync(
            path.join(__dirname, "/defaults/servers.json"),
            serversPath
        );

    console.log("JSON files copied.");
    showMainWindow();
}

ipc.on("exit", function (id) {
    mainWindow.destroy();
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
    if (process.platform != "darwin") app.quit();
});

app.on("ready", function () {
    // Check just in case the user forgot to extract the zip.
    zipCheck = app.getPath("exe").includes(os.tmpdir());
    if (zipCheck) {
        var errorMessage =
            "It has been detected that MQClient is running from the TEMP folder.\n\n" +
            "Please extract the entire Client folder to a location of your choice before starting MQClient.";
        dialog.showErrorBox("Error!", errorMessage);
        return;
    }

    var appPath = path.join(unityHomeDir, "UnityWebPlayerDevelopment.exe");

    // Check if the unity web player needs to be installed
    installWebPlayer(appPath, ["/S"]);

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        icon: __dirname + "/build/icon.ico",
        show: false,
        "web-preferences": {
            plugins: true,
        },
    });

    mainWindow.setMinimumSize(800, 600);

    // Check for first run
    try {
        if (!fs.existsSync(serversPath) || !fs.existsSync(configPath)) {
            console.log("Config files not found. Running initial setup.");
            initialSetup();
        } else {
            showMainWindow();
        }
    } catch (ex) {
        dialog.showErrorBox(
            "Error!",
            "An error occurred while checking for the server list. Make sure you have sufficent permissions."
        );
        app.quit();
    }

    // Makes it so external links are opened in the system browser, not Electron
    mainWindow.webContents.on("new-window", function (event, url) {
        event.preventDefault();
        require("shell").openExternal(url);
    });

    mainWindow.on("closed", function () {
        mainWindow = null;
    });
});

function showMainWindow() {
    // Load the index.html of the app.
    mainWindow.loadUrl("file://" + __dirname + "/index.html");

    // Reduces white flash when opening the program
    mainWindow.webContents.on("did-finish-load", function () {
        if (!hasExecuted) {
            mainWindow.webContents.executeJavaScript("setAppVersionText();");
            // everything's loaded, tell the renderer process to do its thing
            mainWindow.webContents.executeJavaScript("loadConfig();");
            mainWindow.webContents.executeJavaScript("loadServerList();");

            hasExecuted = true;
        }
        mainWindow.show();
    });

    mainWindow.webContents.on("plugin-crashed", function () {
        var errorMessage =
            "Unity Web Player has crashed - please re-open the application.\n" +
            "If this error persists, please read the FAQ or ask for support in our Discord server.";
        dialog.showErrorBox("Error!", errorMessage);
        mainWindow.destroy();
        app.quit();
    });
}
