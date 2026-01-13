import { LightningElement, api } from 'lwc';

import {OmniscriptBaseMixin} from 'omnistudio/omniscriptBaseMixin';

// columns can also be received from the FlexCard's definition


export default class DataTable extends OmniscriptBaseMixin(LightningElement) {

    @api records;   
    
    @api columns;

    data =[];

    selectedRows=[];    

    connectedCallback(){

        this.data = this.records;        

        this.columns=this.columns;       


//        console.log('columns = '+JSON.stringify(this.columns));

  //      console.log("Records = " + JSON.stringify(this.data));

        this.template.addEventListener('selectrow', event => {

         //   console.log('selectedrow event' + JSON.stringify(event.detail.result));

            if (event.detail.result === "all") {
                this.selectedRows = this.records;

            } else if (event.detail.result === "none") {

                this.selectedRows = [];

            } else if(event.detail.result.selectrow) {

                // Prevent duplicates by uniqueKey (Id)
                const incoming = event.detail.result;
                const exists = this.selectedRows.some(r => r.uniqueKey === incoming.uniqueKey);
                if (!exists) {
                    this.selectedRows.push(incoming);
                }

            } else {

                this.selectedRows.forEach(function(item, index, object) {

                    console.log('THIS IS HOW I DELETE' + JSON.stringify(event.detail.result));

                    if(item.uniqueKey === event.detail.result.uniqueKey) {

                        object.splice(index, 1);

                    }

                })

            }

            this.omniApplyCallResp({"selectedRows": this.selectedRows});

        });

    }

}
