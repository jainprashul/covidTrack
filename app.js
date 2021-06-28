#!/usr/bin/env node
const axios = require('axios')
const argv = require('minimist')(process.argv.slice(2));
const { format } = require('date-fns');
const isMatch = require('date-fns/isMatch')
const sound = require("sound-play");
const path = require("path");
const notificationSound = path.join(__dirname, "sounds/beep.wav");

const defaultInterval = 5; // interval between pings in minutes
const appointmentsListLimit = 10 // Increase/Decrease it based on the amount of information you want in the notification.
let timer = null;
let currentTime = defaultInterval; //in minutes
const sampleUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36'

checkParams();

function checkParams() {
    if (argv.help) {
        console.error('Refer documentation for more details');
    } else if (argv._ && argv._.length && argv._.includes('run')) {
        if (argv.tbot && typeof argv.tbot !== 'string') {
            console.error('Please provide a valid Telegram Bot ID by appending --tbot=<TELEGRAM-BOT-ID> to recieve mobile notification \nRefer documentation for more details');
            return;
        } else if (argv.dhook && typeof argv.dhook !== 'string') {
            console.error('Please provide a valid Discord Webook Url by appending --dhook=<DISCORD-WEBHOOK-URL> to recieve mobile notification \nRefer documentation for more details');
            return;
        } else if (argv.tchat && typeof argv.tchat !== 'number') {
            console.error('Please provide a valid Telegram Chat ID by appending --tchat=<TELEGRAM-CHAT-ID> to recieve mobile notification \nRefer documentation for more details');
            return;
        } else if (argv.tbot && !argv.tchat || !argv.tbot && argv.tchat) {
            console.error('Please provide both Telegram Bot ID and Telegram Chat ID to recieve mobile notification \nRefer documentation for more details');
            return;
        } else if (!argv.age) {
            console.error('Please provide your age by appending --age=<YOUR-AGE> \nRefer documentation for more details');
            return;
        } else if (!argv.district && !argv.pin) {
            console.error('Please provide either district-id or pincode by appending --district=<DISTRICT-ID> or --pin=<PINCODE> \nRefer documentation for more details');
            return;
        } else if (argv.pin && argv.pin.toString().length !== 6) {
            console.error('Pincode must be a 6 digit number \nRefer documentation for more details');
            return;
        } else if (argv.interval && argv.interval < 1) {
            // these APIs are subject to a rate limit of 100 API calls per 5 minutes per IP
            console.error('Please provide an interval greater than or equal to 1 minutes');
            return;
        } else if (argv.date && !isMatch(argv.date, 'dd-MM-yyyy')) {
            console.error('Please provide date in dd-mm-yyyy format');
            return;
        } else if (!argv.dose || (argv.dose && argv.dose !== 1 && argv.dose !== 2)) {
            console.error('Please mention if your require first dose or second dose by passing --dose=1 or --dose=2 \n');
            return;
        } 
        else if ((argv.vaccine && typeof argv.vaccine !== 'string') || (argv.vaccine && argv.vaccine.toLowerCase() !== 'covishield' && argv.vaccine.toLowerCase() !== 'covaxin')) {
            console.error('Please provide vaccine param as COVAXIN or COVISHIELD');
            return;
        } 
        else {            
            const params = {
                vaccine: argv.vaccine, // vaccine = COVISHIELD , COVAXIN
                dose: argv.dose, // dose = 1, 2
                tbot: argv.tbot,
                tchat: argv.tchat,
                dhook: argv.dhook,
                age: argv.age,
                districtId: argv.district,
                interval: argv.interval || defaultInterval,
                appointmentsListLimit: argv.appts || appointmentsListLimit,
                date: argv.date || format(new Date(), 'dd-MM-yyyy'),
                pin: argv.pin
            }

            console.log('\nCowin Pinger started succesfully\n');
            console.log(`Date= ${params.date}`);
            console.log(`Age= ${params.age}`);
            console.log(`Dose= ${params.dose === 1 ? 'First Dose' : 'Second Dose'}`);
            params.vaccine && console.log(`Vaccine= ${params.vaccine.toUpperCase()}`);
            if (params.pin) {
                console.log(`Pincode= ${params.pin}`);
            } else {
                console.log(`District ID= ${params.districtId}`);
            }
            console.log(`Time interval= ${params.interval} minutes (default is 10)`);
            console.log(`Appointment Count= ${params.appointmentsListLimit} (default is 2)`);
            if (params.dhook){
                console.log(`Discord WebhookUrl : ${params.dhook || 'not configured'}`);
            }
            if (params.tbot && params.tchat) {
                console.log(`Telegram Bot ID= ${params.tbot || "not configured"}`);
                console.log(`Telegram Chat ID= ${params.tchat || "not configured"}`);
            } else {
                console.log('\nMake sure to turn up the volume to hear the notifcation sound')
            }
            console.log('\n\n')
            scheduleCowinPinger(params);
        }
    } else {
        console.log('\nInvalid command\n\nRun `cowin-pinger-discord run` with all required params to start pinging cowin portal\nRefer documentation for instructions on how to run package\n');
    }
}

function scheduleCowinPinger(params) {
    let pingCount = 0;
    let rainCheck = false;
    timer = setInterval(() => {
        // console.clear();
        pingCount += 1;
        rainCheck = pingCowin(params);
        console.log(new Date().toLocaleTimeString(), " Ping Count - ", pingCount);
    }, (rainCheck ? 0.5 : params.interval) * 60000);  
}

function pingCowin({ tbot, tchat, dhook, age, districtId, appointmentsListLimit, date, pin, vaccine, dose }) {
    let flag = false; // check whether slots available set true
    const baseUrl = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/'

    let url = pin ? `${baseUrl}calendarByPin?pincode=${pin}&date=${date}` : `${baseUrl}calendarByDistrict?district_id=${districtId}&date=${date}`

    axios.get(url, { headers: { 'User-Agent': sampleUserAgent } }).then((result) => {
        const { centers } = result.data;
        let isSlotAvailable = false;
        let dataOfSlot = `Availibilty for ${ centers[0].district_name} for age ${age} \n`;
        let appointmentsAvailableCount = 0;
        if (centers.length) {
            centers.forEach(center => {
                center.sessions.forEach((session => {
                    if (session.min_age_limit <= +age && session.available_capacity > 0) {
                        if(dose === 1 && session.available_capacity_dose1 <= 0){
                            return;
                        }
                        if(dose === 2 && session.available_capacity_dose2 <= 0){
                            return;
                        }
                        if(vaccine && vaccine.toLowerCase() !== session.vaccine.toLowerCase()) {
                            return;
                        }
                        isSlotAvailable = true
                        appointmentsAvailableCount++;
                        // if (appointmentsAvailableCount <= appointmentsListLimit) {
                        //     dataOfSlot = `${dataOfSlot}\nSlot for ${session.available_capacity} is available: ${center.name}, ${center.address}, ${center.block_name} on ${session.date}`;
                        // }
                        dataOfSlot = `${dataOfSlot}\n ${session.available_capacity} slots available: ${center.name}, ${center.address}, ${center.block_name} on ${session.date} \n`;

                    }
                }))
            });

            // if (appointmentsAvailableCount - appointmentsListLimit) {
            //     dataOfSlot = `${dataOfSlot}\n${appointmentsAvailableCount - appointmentsListLimit} more slots available...`
            // }
        }
        if (isSlotAvailable) {
            let WebhookUrl = dhook ? dhook : 'https://discord.com/api/webhooks/845311349622177813/cj0jVYkZ18bIjrSwtpht6fHhMpT4Q7o8Hh1qg8pnZxCTr0_GXQCD-siGke8LLzgn4rv6'
            axios.post(WebhookUrl , {
                "content": "@everyone Cowin Vaccine Alert",
                "allowed_mentions": {
                    "parse": ["everyone"]
                },
                "embeds": [{
                    "description": dataOfSlot,
                    "title": 'Book from CoWin',
                    "url": 'https://selfregistration.cowin.gov.in/',
                  }]
            })
            
            let botId = tbot ? tbot : '1699519640:AAFDRswwb9vVEWaNovjWpmq2B6gtf9MGkWY'
            let chatId = tchat ? tchat.toString() : '-1001485703197'
            let TeleBot = `https://api.telegram.org/bot${botId}/sendMessage?chat_id=${chatId}&text=${dataOfSlot}`
            axios.get(TeleBot)
            
            // sound.play(notificationSound ,1);
            console.log(dataOfSlot);
            flag = true;
        } 

        
    }).catch((err) => {
        console.log("Error: " + err.message);
    });

    console.log(flag);
    return flag;
}
