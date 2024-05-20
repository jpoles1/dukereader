import chalk from "chalk";
import { XMLParser } from "fast-xml-parser";
import puppeteer, {Browser} from "puppeteer";
import fs from "fs";

function sleep(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export class Duke {
	browser: Browser | undefined;
	refresh_interval_min = 15;
	db_store: ((raw_data: any) => Promise<any>) | undefined;

	public constructor(values: Partial<Duke>) {
		Object.assign(this, values);
		if (!this.valid_config()) {
			return;
		}
	}

	valid_config(): boolean {
		const req_config = ["EMAIL", "PASSWORD", "ACCOUNTNUM"];
		return req_config.every((config) => {
			if (!process.env[config]) {
				console.log(chalk.red(`${config} is not set in the .env config! Exiting...`));
				return false;
			}
			return true;
		});
	}

	async init(): Promise<void> {
		this.browser = await puppeteer.launch({
			defaultViewport: { width: 1920, height: 1080 },
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	}
	async login(): Promise<void> {
		const page = await this.browser!.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0');
		// Login to ConEd website
		await page.goto("https://www.duke-energy.com/my-account/sign-in");
		await page.type("#Split-Sign-In-signInUsername_tealeaf-unmask", process.env.EMAIL!);
		await page.type("#Split-Sign-In-signInPassword", process.env.PASSWORD!);
		await page.click("button[type=submit]");
		// Wait for login to authenticate
		await page.waitForNavigation();
	}
	async read_api(): Promise<any> {
		const api_url = "https://p-auth.duke-energy.com/form/PlanRate/GetEnergyUsage";
		/*const req_json = {
			request: JSON.stringify({
				"SrcAcctId": process.env.ACCOUNTNUM,"SrcAcctId2":"","SrcSysCd":"ISU","ServiceType":"ELECTRIC",
				"MeterSerialNumber": process.env.METERNUM,
				"IntervalFrequency":"halfhourlyEnergyUse",
				"Netmetering":"N","PeriodType":"Day",
				"StartDate":"05/18/2024","EndDate":"05/18/2024"
			})
		}*/
		const req_json = {
			request: JSON.stringify({
				"SrcAcctId": process.env.ACCOUNTNUM,
				"SrcAcctId2":"",
				"SrcSysCd":"ISU",
				"ServiceType":"ELECTRIC"
			})
		}

		const api_page = await this.browser!.newPage();
		await api_page.setRequestInterception(true);
		api_page.once('request', request => {
			//console.log(request.headers())
			request.continue({ method: 'POST', postData: JSON.stringify(req_json), headers: {
				"Accept": "application/json, text/plain, */*",
				"Content-Type": "application/json",
				"Cookie": request.headers().Cookie
			} });
		});
    	await api_page.goto(api_url, { timeout: 10000 });
		const api_xml = await api_page.content();

		// Parse XML
		const parser = new XMLParser();
		const raw_data = parser.parse(api_xml)["html"]["body"]["ns3:entry"]["ns3:link"]["ns3:content"]
		const data = raw_data["espi:intervalblock"]
		const reading_interval = data["espi:interval"]["espi:secondsperinterval"]
		const readings = data["espi:intervalreading"].map((reading: any) => {
			if (reading["espi:readingquality"] != "ACTUAL") {
				return undefined
			}
			return {
				time: reading["espi:timeperiod"]["espi:start"],
				value: reading["espi:value"]
			}
		}).filter((x: any) => x !== undefined)
		fs.writeFileSync("duke.json", JSON.stringify(raw_data, null, 2));
		console.log(reading_interval)
		return readings.map((reading: any) => {
			return {
				startTime: new Date(reading["time"] * 1000),
				endTime: new Date((reading["time"] + reading_interval)  * 1000),
				energy: reading["value"]
			}
		})
	}
	async fetch_once(): Promise<void> {
		await this.init();
		await this.login();
		let raw_data = await this.read_api();
		let attempt = 1;
		while ("error" in raw_data && attempt < 5) {
			console.log(chalk.yellow("Failed to fetch data from API:", raw_data["error"]["details"]));
			raw_data = await this.read_api();
			await sleep(15000);
			attempt++;
		}
		if (attempt < 5) {
			console.log(chalk.green("Successfully retrieved API data!"));
			this.db_store!(raw_data);
		} else {
			console.log(chalk.red("Failed to retrieve API data:", raw_data["error"]));
		}
		await this.browser?.close();
	}
	monitor(interval_min = 15): void {
		this.fetch_once();
		setInterval(() => {
			this.fetch_once();
		}, interval_min * 60 * 1000);
	}
}