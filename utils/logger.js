import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, "../logs");
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, {recursive: true});
        }
    }

    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    getLogFileName() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.log`;
    }

    async writeLog(level, message, error = null) {
        const timestamp = this.getCurrentTimestamp();
        const logFile = path.join(this.logDir, this.getLogFileName());

        let logMessage = `[${timestamp}] [${level}] ${message}`;
        if (error) {
            logMessage += `\nError Stack: ${error.stack}`;
        }
        logMessage += "\n";

        await fs.promises.appendFile(logFile, logMessage, "utf8");

        // 콘솔에도 출력
        if (level === "ERROR") {
            console.error(logMessage);
        } else {
            console.log(logMessage);
        }
    }

    info(message) {
        this.writeLog("INFO", message);
    }

    error(message, error = null) {
        this.writeLog("ERROR", message, error);
    }

    warn(message) {
        this.writeLog("WARN", message);
    }

    debug(message) {
        if (process.env.NODE_ENV === "development") {
            this.writeLog("DEBUG", message);
        }
    }
}

export const logger = new Logger();
