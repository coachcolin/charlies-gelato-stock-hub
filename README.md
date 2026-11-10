# Charlie's Gelato Stock Buddy

I want to build a Stock management app for my parents gelato store. It needs to:

- manage stock levels for the business tracking what is in all 3 freezers

- be able to input easily what stock is produced - stock additions

- Be able to predict what ice cream should be made this week based on current stock levels and forecast of how much will be used based on past data of stock levels (e.g. it tracks how quickly stock levels go down (as that is what is being used). So it will pick up trends and everything to help predict what stock is low based on levels and usage and triage what needs to be topped up first

- be able to quickly and easy log if you are removing stock from the freezers (needs to be easy so people use it. 

- be able to upload wholesale invoices where people have ordered stock, treating these as stock deductions. For your context - stock is sold two ways, wholesale where people order in bulk and in the store - where staff will remove stock from the freezers to put in the display cabinet. We need to track both as they are both sale which = stock deduction.

- It needs to be very easy to input easily for both stock additions and removals to make sure the tool gets used

- there are 3 freezers, so it needs to track what is in each

- It should produce a ‘production report’ on demand (likely once a week) which tells you what flavours most are in need of producing, based on both a. What stock levels are low (the stock remaining formula above based on current levels and forecast consumption), and what wholesale orders have come in (to make sure we have levels for this)

- it should track what capacity the freezers are at in term of fullness with ice-cream

- The business is called Charlie’s Gelato - use their branding 

- There will be a list of flavours which will be entered early - then there should be a data management section, where you control the stock options, be able to add and delete flavours, have a not active option when there flavours wont come up in the main app (if a flavour isn’t being made at the moment)

- there are lots of people who will use this (mainly just for logging additions or removal of trays of ice-cream), so it needs to be very easy, and readable on iPad and phone etc. 

- stock levels need to be easily editable, e.g. when you do a stock take and find variances, so you can updates

Thinking of the Home Screen, the main options / buttons should be:
- remove stock
- current stock levels
- production report 
- add stock
- import wholesale order 
- edit current stock levels
 - data management

Details on each page:

Add stock:
A list of flavours comes up with Popular at the top (5 flavours) and then the rest below it in alphabetical order. There is a search bar at the top which they can start typing a flavour and the list automatically filters. You press the flavour and then add the number of units are adding. This adds to the current stock balance ofcourse. All stock additions need to be saved for records, so we can see what stock was added and when

Remove Stock:
A list of flavours comes up with Popular at the top (5 flavours) and then the rest below it in alphabetical order. There is a search bar at the top which they can start typing a flavour and the list automatically filters. You press the flavour and then add the number of units you are removing. This takes down the current stock balance ofcourse. All stock removals need to be saved so we can see what was removed and when.

Quite often you take multiple flavours, so when you choose one, you can then use the search bar and select others, selecting the units as above - and the units you have selected show at the bottom. Once you are done, you can check out the units by pressing confirm.

Wholesale Orders:
We need to be able to upload wholesale orders directly into the app. These come from a different sales platform. This app needs to read the upload and see what stock has been ordered. First, it confirms we have enough stock to complete the order, and then it logs an order on the app. (within this section we need an ‘Active Orders’ and ‘Completed Orders’ sub-section). When it gets uploaded it goes to active orders, showing what has been ordered and the current stock levels we have in each flavour. The staff can also edit the active orders (e.g. quantity of each). When this gets sent to the wholesaler, the staff will then mark this order as complete, the stock will be treated as sold and taken off current stock levels. and it will go to the completed orders section. All completed orders are stored here for data purposes. It also needs to save what wholesaler it was, so we can track what the wholesalers are ordering.

If this order is not for immediate, then there needs to be a flag called ‘Future Order’. If this is checked, then the staff needs to enter in the day the order will be sent. This order needs to be factored into the calculations for the production report as we will need to make sure we have enough in stock for when that order goes out. Orders still tagged as future orders still stay in the active orders section.


Production Report:
This is the engine that works out what stock needs producing the most. It works this out by looking at current stock levels of each flavour and comparing it to sales history over the past few weeks / months (a.k.a stock removals / wholesale orders) to first estimate what is needed.

The production report will first be a suggestion to the user, saying ‘Based on recent sales and current levels, this is what we think you’ll need’. The goal is to look at the last 2 weeks of sales (stock removals) and remove this from stock levels to see what we will likely run out of first.

As there will be no sales data for a while, we need another mechanism to show what flavours are most needed, and this will be user input. There are three seasons for the business – Peak Season, Mid Season, Low Season. The user will input the desired quantity of each flavour that they would like to have in stock for each of these three seasons, e.g. in Peak Season we want to have 20 trays of chocolate in stock, in Mid Season we only need 15 and Low Season 10 (so 3 inputs for each flavour). The stock tool then looks at what stock levels are furthest from the desired amount, and these will be the stock that needs producing first. There are also key priority flavours that always need to be in stock (maybe 10 flavours) – the user will mark if they are priorities in the data management section, and these should be put at a higher priority on the production report.

Once the report is suggested – the user will then edit the report as they feel necessary, removing suggestions / flavours, changing the qusntity of suggestions, or adding flavours that have been missed. This should be very user friendly (e.g. small x on the top right of each suggestion to remove, easy add (by search) button, quantities easy to press into and change etc. Once the user is happy, this become the production report and goes to an ‘active report’ section.

From the active report section, the maker of the ice cream can mark off flavours as she produces them (with the number of units she actually produced – so she can either tick the flavour if it is the same number of units, or change it if it is different). Once a flavour is ticked as complete, this gets added to the stock levels. This also needs to be remembered as additions so we can track stock level changes

Edit current stock levels:

This just shows a list of all flavours and their quantities, with easily editable quantities so that the user can input the correct units after their stock take. Once the user is finished editing – a variance report is produced showing what changes / the largest variance between stock in the system vs stock in real life, so that the user can understand what went wrong.

 

Data Management:

This is a list of all flavours and the data on them. The user can add and remove flavours, change names, add pictures of each, mark them as non-active (active is always the default), mark flavours as priority, and add desired stock levels for each season (talked about in the production report)

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://charlies-gelato-stock-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/30c9e8c2-414a-47a5-a0a5-a3b31b19070f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
