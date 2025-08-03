class AlternativeBaseHandler {
    jsShoppingCart = null;
    baseDocument = null;
    payPalSDK = null;


    constructor(payPalSDK, jsShoppingCart, baseDocument, ) {
        this.payPalSDK = payPalSDK;
        this.jsShoppingCart = jsShoppingCart;
        this.baseDocument = baseDocument;

    }
    /**
     *
     * @param {string} url
     * @param {array} data
     * @returns {Promise<any>}
     */
    async createPaypalOrder(url, data = []) {
        const responseOrder = await fetch(url, {
            method: 'post',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        return responseOrder.json();
    }
}

class GooglePayHandler extends AlternativeBaseHandler {

    /**
     * An initialized google.payments.api.PaymentsClient object or null if not yet set
     * An initialized paypal.Googlepay().config() response object or null if not yet set
     *
     * @see {@link getGooglePaymentsClient}
     */

    let
    paymentsClient = null
    googlePayConfig = null
    googlePaySDK = null

    const
    GOOGLE_PAY_BUTTON_BLOCK_ID = 'paypal-google-button-container';

    constructor(
        googlePaySDK,
        payPalSDK,
        jsShoppingCart,
        baseDocument
    ) {
        super(payPalSDK, jsShoppingCart, baseDocument);
        this.googlePaySDK = googlePaySDK;
    }


    /**
     *
     * @returns Fetch the Google Pay Config From PayPal
     */
    async getGooglePayConfig() {
        if (this.googlePayConfig === null) {
            this.googlePayConfig = await this.payPalSDK.Googlepay().config();

        }
        return this.googlePayConfig;
    }

    /**
     * Configure support for the Google Pay API
     *
     * @see {@link https://developers.google.com/pay/api/web/reference/request-objects#PaymentDataRequest|PaymentDataRequest}
     * @returns {object} PaymentDataRequest fields
     */
    async getGooglePaymentDataRequest() {
        const {
            allowedPaymentMethods,
            merchantInfo,
            apiVersion,
            apiVersionMinor,
            countryCode
        } = await this.getGooglePayConfig();
        const baseRequest = {
            apiVersion,
            apiVersionMinor
        }
        const paymentDataRequest = Object.assign({}, baseRequest);

        paymentDataRequest.allowedPaymentMethods = allowedPaymentMethods;
        paymentDataRequest.transactionInfo = this.getGoogleTransactionInfo(countryCode);
        paymentDataRequest.merchantInfo = merchantInfo;

        paymentDataRequest.callbackIntents = ["PAYMENT_AUTHORIZATION"];

        return paymentDataRequest;
    }

    /**
     * Handles authorize payments callback intents.
     *
     * @param {object} paymentData response from Google Pay API after a payer approves payment through user gesture.
     * @see {@link https://developers.google.com/pay/api/web/reference/response-objects#PaymentData object reference}
     *
     * @see {@link https://developers.google.com/pay/api/web/reference/response-objects#PaymentAuthorizationResult}
     * @returns Promise<{object}> Promise of PaymentAuthorizationResult object to acknowledge the payment authorization status.
     */
    onPaymentAuthorized(paymentData) {
        this.processPayment(paymentData).then((result) => {
            console.log(result)
        }).catch((error) => {
            console.log(error);
        });
    }


    /**
     * Return an active PaymentsClient or initialize
     *
     * @see {@link https://developers.google.com/pay/api/web/reference/client#PaymentsClient|PaymentsClient constructor}
     * @returns {google.payments.api.PaymentsClient} Google Pay API client
     */
    getGooglePaymentsClient() {
        if (this.paymentsClient === null) {
            this.paymentsClient = new this.googlePaySDK.payments.api.PaymentsClient({
                environment: 'TEST',
                paymentDataCallbacks: {
                    onPaymentAuthorized: (paymentData) => {
                        this.onPaymentAuthorized(paymentData);
                    }
                }
            });
        }
        return this.paymentsClient;
    }


    /**
     * Initialize Google PaymentsClient after Google-hosted JavaScript has loaded
     *
     * Display a Google Pay payment button after confirmation of the viewer's
     * ability to pay.
     */
    async onGooglePayLoaded() {
        const paymentsClient = this.getGooglePaymentsClient();
        const {
            allowedPaymentMethods,
            apiVersion,
            apiVersionMinor
        } = await this.getGooglePayConfig();
        return new Promise((resolve, reject) => {
            paymentsClient.isReadyToPay({
                allowedPaymentMethods,
                apiVersion,
                apiVersionMinor
            }).then((response) => {
                if (response.result === true) {
                    this.addGooglePayButton();
                    resolve(response)
                }
            }).catch((err) =>  {
                reject(err)
            });
        })

    }

    /**
     * Add a Google Pay purchase button alongside an existing checkout button
     *
     * @see {@link https://developers.google.com/pay/api/web/reference/request-objects#ButtonOptions|Button options}
     * @see {@link https://developers.google.com/pay/api/web/guides/brand-guidelines|Google Pay brand guidelines}
     */
    addGooglePayButton() {
        const paymentsClient = this.getGooglePaymentsClient();
        const button = paymentsClient.createButton({
            buttonType: "checkout",
            buttonLocale: this.jsShoppingCart.languageCode,
            onClick:  () => {return  this.onGooglePaymentButtonClicked()}
        });
        button.id = this.GOOGLE_PAY_BUTTON_BLOCK_ID;
        button.style.display = 'none';
        let continueButtonBlock = this.baseDocument.querySelector('#checkout_payment div.continue_button')
        let googlePay = this.baseDocument.getElementById(this.GOOGLE_PAY_BUTTON_BLOCK_ID);
        if (!googlePay) {
            continueButtonBlock.appendChild(button);
        }

    }

    /**
     * Provide Google Pay API with a payment amount, currency, and amount status
     *
     * @see {@link https://developers.google.com/pay/api/web/reference/request-objects#TransactionInfo|TransactionInfo}
     * @returns {object} transaction info, suitable for use as transactionInfo property of PaymentDataRequest
     */
    getGoogleTransactionInfo(countryCode) {
        return {
            countryCode: countryCode,
            currencyCode: this.jsShoppingCart.currency,
            totalPriceStatus: "FINAL",
            totalPrice: this.jsShoppingCart.orderTotalGross.toString()
        };
    }


    /**
     * Show Google Pay payment sheet when Google Pay payment button is clicked
     */
    async onGooglePaymentButtonClicked() {
        const paymentDataRequest = await this.getGooglePaymentDataRequest();
        const paymentsClient = this.getGooglePaymentsClient();
        paymentsClient.loadPaymentData(paymentDataRequest);
    }

    /**
     * Process payment data returned by the Google Pay API
     *
     * @param {object} paymentData response from Google Pay API after user approves payment
     * @see {@link https://developers.google.com/pay/api/web/reference/response-objects#PaymentData|PaymentData object reference}
     */
    async processPayment(paymentData) {
        const orderData = await this.createPaypalOrder(this.jsShoppingCart.createOrderUrl, []);
        const payPalOrderId = orderData.id;
        const {id, status} = await this.payPalSDK.Googlepay().confirmOrder({
            orderId: payPalOrderId,
            paymentMethodData: paymentData.paymentMethodData
        });
        return new Promise((resolve, reject) => {
            if (status === 'APPROVED') {
                document.querySelector('#checkout_payment input[name="PayPal2HubOrderId"]').value = id;
                document.querySelector('#checkout_payment input[name="PayPal2HubPayerId"]').value = this.googlePayConfig.merchantInfo.merchantId;
                document.querySelector('#checkout_payment').submit();
                resolve({transactionState: 'SUCCESS'});
            } else  {
                reject({transactionState: 'ERROR'});
            }
        })

    }
}

export {GooglePayHandler}
