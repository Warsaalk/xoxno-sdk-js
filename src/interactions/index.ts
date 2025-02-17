import type { Interaction } from '@multiversx/sdk-core/out/smartcontracts/interaction';
import { GlobalOffer } from '../types/collection';
import { XOXNOClient } from '..';
import { ContractQueryRunner } from '../utils/scCalls';
import { SmartContractAbis } from '../utils/SmartContractAbis';
import { getSmartContract } from '../utils/SmartContractService';
import type { SmartContract } from '@multiversx/sdk-core/out/smartcontracts/smartContract';
import {
  BigUIntType,
  BigUIntValue,
  U64Type,
  U64Value,
} from '@multiversx/sdk-core/out/smartcontracts/typesystem/numerical';
import {
  AcceptGlobalOffer,
  Auction,
  AuctionType,
  ChangeListing,
  NFTBody,
  NewListingArgs,
  Payment,
  SendCustomOffer,
  SendGlobalOffer,
  WithSenderAndNonce,
} from '../types/interactions';
import BigNumber from 'bignumber.js';
import {
  Struct,
  StructType,
} from '@multiversx/sdk-core/out/smartcontracts/typesystem/struct';
import {
  TokenIdentifierType,
  TokenIdentifierValue,
} from '@multiversx/sdk-core/out/smartcontracts/typesystem/tokenIdentifier';
import {
  Field,
  FieldDefinition,
} from '@multiversx/sdk-core/out/smartcontracts/typesystem/fields';
import {
  BooleanType,
  BooleanValue,
} from '@multiversx/sdk-core/out/smartcontracts/typesystem/boolean';
import { Address } from '@multiversx/sdk-core/out/address';
import { TokenTransfer } from '@multiversx/sdk-core/out/tokens';
export class SCInteraction {
  private xo: SmartContract;
  private call: ContractQueryRunner;
  private api: XOXNOClient;
  private constructor(marketAbiXOXNO: SmartContract) {
    this.xo = marketAbiXOXNO;
    this.call = new ContractQueryRunner();
    this.api = XOXNOClient.init();
  }

  static async init() {
    const config = XOXNOClient.init().config;
    const marketAbiXOXNO = await SmartContractAbis.getMarket();
    const xo_abi = getSmartContract(marketAbiXOXNO, config.XO_SC);

    return new SCInteraction(xo_abi);
  }

  private async getResult(interaction: Interaction) {
    return await this.call.runQuery(this.xo, interaction);
  }

  /**
   * Gets the percentage of each transaction that will be paid to the marketplace.
   *
   * @returns The percentage of each transaction that will be paid to the marketplace.
   */
  public getMarketplaceFees = async (): Promise<number> => {
    const interaction = this.xo.methods.getMarketplaceCutPercentage();
    const result = await this.getResult(interaction);
    return parseInt(result.firstValue?.valueOf());
  };

  /**
   * Retrieves the list of accepted payment tokens.
   * @returns {string[]} A list of accepted payment tokens.
   */
  public getAcceptedPaymentTokens = async (): Promise<string[]> => {
    const interaction = this.xo.methods.getAcceptedTokens();
    const result = await this.getResult(interaction);
    return result.firstValue?.valueOf();
  };

  /**
   * This function returns a list of IDs of global offers.
   * @returns {number[]} a list of IDs of global offers.
   */

  public getGlobalOfferIDs = async (): Promise<number[]> => {
    const interaction = this.xo.methods.getGlobalOffers();
    const result = await this.getResult(interaction);
    return result.firstValue?.valueOf().map((id: string) => parseInt(id));
  };

  /**
   * Gets the balance of a user in a token of a specific pool.
   * @param address The address of the user.
   * @param token The token address.
   * @param nonce The nonce of the pool.
   * @returns {number} The balance of the user in the token of the pool.
   */
  async getUserPoolBalance(
    address: string,
    token: string,
    nonce: number
  ): Promise<number> {
    const result = await this.getResult(
      this.xo.methods.userDeposit([address, token, nonce])
    );

    if (!result?.firstValue) {
      return 0;
    }
    return new BigUIntValue(result.firstValue.valueOf().amount)
      .valueOf()
      .shiftedBy(-18)
      .toNumber();
  }

  // function to determine if the offer is active
  // based on the offer price and user balance
  private isOfferActive(offer_price: number, user_balance: number): boolean {
    return offer_price <= user_balance;
  }

  /**
   * Returns the global offer data for the offer with the given id.
   *
   * @param global_offer_id The id of the global offer for which to return the data.
   *
   * @returns An object containing the global offer data for the offer with the given id. If the global offer id is invalid, the return value will be null.
   */

  public getGlobalOfferData = async (
    global_offer_id: number
  ): Promise<GlobalOffer> => {
    const interaction = this.xo.methods.getGlobalOffer([global_offer_id]);
    const result = await this.getResult(interaction);
    const body = result.firstValue?.valueOf();
    body.offer_id = parseInt(body.offer_id.valueOf());
    body.marketplace = 'XO';
    body.short_price = parseFloat(
      new BigUIntValue(body.price).valueOf().shiftedBy(-18).toString()
    );
    body.new_version = Boolean(body.new_version);
    if (!body.new_version) {
      body.isActive = this.isOfferActive(
        body.short_price,
        await this.getUserPoolBalance(
          body.owner,
          body.payment_token,
          body.payment_nonce
        )
      );
    } else {
      body.isActive = true;
    }
    body.quantity = parseInt(body.quantity.valueOf());
    body.payment_nonce = parseInt(body.payment_nonce.valueOf());
    body.price = body.price.valueOf();

    body.timestamp = parseInt(body.timestamp.valueOf());
    body.owner = body.owner.valueOf().toString();
    if (body.attributes) {
      body.attributes = JSON.parse(
        Buffer.from(body.attributes.valueOf().toString(), 'base64').toString(
          'ascii'
        )
      );
    }
    return body as GlobalOffer;
  };

  /**
   * Returns the auction struct for the given id.
   *
   * @param auctionID The id of the auction for which to return the data.
   *
   * @returns {Auction} An object containing the auction data for the given id. If the auction id is invalid, the return value will be null.
   */

  public getAuctionInfo = async (
    auctionID: number
  ): Promise<Auction | null> => {
    const interaction = this.xo.methods.getFullAuctionData([auctionID]);
    const result = await this.getResult(interaction);
    const body = result.firstValue?.valueOf();
    if (!body) {
      return null;
    }
    body.auctioned_token_nonce = parseInt(body.auctioned_token_nonce.valueOf());
    body.nr_auctioned_tokens = parseInt(body.nr_auctioned_tokens.valueOf());
    body.auction_type = body.auction_type.name;
    body.payment_token_nonce = parseInt(body.payment_token_nonce.valueOf());
    body.min_bid = body.min_bid.valueOf();
    body.max_bid = body.max_bid.valueOf();
    body.start_time = parseInt(body.start_time.valueOf());
    body.deadline = parseInt(body.deadline.valueOf());
    body.original_owner = body.original_owner.valueOf().toString();
    body.current_winner = body.current_winner.valueOf().toString();
    body.current_bid = body.current_bid.valueOf().toString();
    body.marketplace_cut_percentage = body.marketplace_cut_percentage.valueOf();
    body.creator_royalties_percentage =
      body.creator_royalties_percentage.valueOf();

    return body as Auction;
  };

  /** Gets the number of listings.
   * @returns {number} The number of listings.
   * */
  public async getListingsCount(): Promise<number> {
    const result = await this.getResult(this.xo.methods.getListingsCount());
    const count = parseInt(result.firstValue?.valueOf());
    return count;
  }

  /** Gets the number of custom offers.
   * @returns {number} The number of custom offers.
   * */
  public async getOffersCount(): Promise<number> {
    const result = await this.getResult(this.xo.methods.getOffersCount());
    const count = parseInt(result.firstValue?.valueOf());
    return count;
  }

  /** Gets the number of global offers.
   * @returns {number} The number of global offers.
   * */
  public async getGlobalOffersCount(): Promise<number> {
    const result = await this.getResult(this.xo.methods.getGlobalOffersCount());
    const count = parseInt(result.firstValue?.valueOf());
    return count;
  }

  /** Gets the number of collections listed.
   * @returns {number} The number of collections listed.
   * */
  public async getCollectionsCount(): Promise<number> {
    const result = await this.getResult(this.xo.methods.getCollectionsCount());
    const count = parseInt(result.firstValue?.valueOf());
    return count;
  }

  /**
   * Checks whether a collection is listed with at least 1 NFT.
   *
   * @param collection name of the collection
   * @return true if the collection is listed, false otherwise
   */
  public async isCollectionListed(collection: string): Promise<boolean> {
    const result = await this.getResult(
      this.xo.methods.isCollectionListed([collection])
    );
    return Boolean(result.firstValue?.valueOf());
  }

  /** Gets the on sale NFT count of the collection.
   *
   * @param collection The collection identifier for which one wants to get the on sale NFT count.
   *
   * @returns {number} The on sale NFT count of the collection.
   * */
  public async getCollectionNFTsOnSaleCount(
    collection: string
  ): Promise<number> {
    const result = await this.getResult(
      this.xo.methods.getTokenItemsForSaleCount([collection])
    );
    return parseInt(result.firstValue?.valueOf());
  }

  /** Gets the active unique auction IDs of collection.
   *
   * @param collection The collection identifier for which one wants to get the active unique auction IDs.
   *
   * @returns {number[]} The active unique auction IDs of collection.
   * */

  public async getAuctionIDsForCollection(
    collection: string
  ): Promise<number[]> {
    const result = await this.getResult(
      this.xo.methods.getAuctionsForTicker([collection])
    );
    const ids = result.firstValue?.valueOf().map((id: string) => parseInt(id));
    return ids;
  }

  /**
   * Withdraw auctions from the smart contract.
   *
   * @param auctionIDs The IDs of the auctions to withdraw from
   * @returns {Interaction} The interaction object of the smart contract
   */

  public withdrawAuctions(
    auctionIDs: number[],
    senderNonce: WithSenderAndNonce,
    market: 'XO'
  ): Interaction {
    if (market === 'XO') {
      const interaction = this.xo.methods.withdraw(auctionIDs);

      if (senderNonce.nonce) {
        interaction.withNonce(senderNonce.nonce);
      }
      return interaction
        .withChainID(this.api.chain)
        .withSender(new Address(senderNonce.address))
        .withGasLimit(
          Math.min(600_000_000, 15_000_000 + auctionIDs.length * 5_000_000)
        );
    } else {
      throw new Error('Market not supported');
    }
  }

  /**
   * Withdraw global offer from the smart contract.
   *
   * @param auctionIDs The IDs of the global offer to withdraw
   * @returns {Interaction} The interaction object of the smart contract
   */

  public withdrawGlobalOffer(
    offerID: number,
    senderNonce: WithSenderAndNonce
  ): Interaction {
    const interaction = this.xo.methods.withdrawGlobalOffer([offerID]);

    if (senderNonce.nonce) {
      interaction.withNonce(senderNonce.nonce);
    }
    return interaction
      .withChainID(this.api.chain)
      .withSender(new Address(senderNonce.address))
      .withGasLimit(15_000_000);
  }

  /**
   * Accept a global offer
   *
   * @param offerID The offer ID
   * @returns {Interaction} The interaction object of the smart contract
   */

  public acceptGlobalOffer({
    signature,
    offer_id,
    auction_id_opt,
    nft,
    address,
    nonce,
  }: AcceptGlobalOffer & WithSenderAndNonce): Interaction {
    const interaction = signature
      ? this.xo.methods.acceptGlobalOffer([offer_id, auction_id_opt, signature])
      : this.xo.methods.acceptGlobalOffer([offer_id, auction_id_opt]);
    interaction.withSender(new Address(address));
    if (nft) {
      interaction.withSingleESDTNFTTransfer(
        TokenTransfer.semiFungible(nft.collection, nft.nonce, nft.amount ?? 1)
      );
    }
    if (nonce) {
      interaction.withNonce(nonce);
    }
    return interaction.withChainID(this.api.chain).withGasLimit(30_000_000);
  }

  /**
   * Send a global offer
   * @param payment_token The token used for payment
   * @param payment_nonce The nonce of the payment token
   * @param price The price of the offer
   * @param collection The collection of the NFT
   * @param attributes The attributes of the NFT
   * @param depositAmount The deposit amount
   * @returns {Interaction} The interaction object of the smart contract
   * */
  public sendGlobalOffer({
    payment_token,
    payment_nonce,
    price,
    collection,
    attributes,
    depositAmount,
    address,
    nonce,
  }: SendGlobalOffer & WithSenderAndNonce): Interaction {
    const interaction = attributes
      ? this.xo.methods.sendGlobalOffer([
          payment_token,
          payment_nonce,
          TokenTransfer.egldFromAmount(price).toString(),
          collection,
          attributes,
        ])
      : this.xo.methods.sendGlobalOffer([
          payment_token,
          payment_nonce,
          TokenTransfer.egldFromAmount(price).toString(),
          collection,
        ]);

    if (nonce) {
      interaction.withNonce(nonce);
    }
    interaction.withSender(new Address(address));
    if (depositAmount) {
      interaction.withValue(TokenTransfer.egldFromAmount(depositAmount));
    }
    return interaction.withChainID(this.api.chain).withGasLimit(30_000_000);
  }

  /**
   * Send a custom offer
   * @param payment_token The token used for payment
   * @param payment_nonce The nonce of the payment token
   * @param price The price of the offer
   * @param deadline The deadline of the offer
   * @param nft The NFT to be sold
   * @param depositAmount The deposit amount
   * @returns {Interaction} The interaction object of the smart contract
   * */
  public sendCustomOffer({
    payment_token,
    payment_nonce,
    price,
    deadline,
    nft,
    depositAmount,
    address,
    nonce,
  }: SendCustomOffer & WithSenderAndNonce): Interaction {
    const interaction = this.xo.methods.sendOffer([
      payment_token,
      payment_nonce,
      TokenTransfer.egldFromAmount(price).toString(),
      nft.collection,
      nft.nonce,
      nft.amount ?? 1,
      deadline,
    ]);
    if (nonce) {
      interaction.withNonce(nonce);
    }
    interaction.withSender(new Address(address));
    if (depositAmount) {
      interaction.withValue(TokenTransfer.egldFromAmount(depositAmount));
    }
    return interaction.withChainID(this.api.chain).withGasLimit(30_000_000);
  }

  /**
   * Withdraws a custom offer
   *
   * @param offerID The offer ID
   * @returns {Interaction} The interaction object of the smart contract
   */

  public withdrawCustomOffer(
    offerID: number,
    senderNonce: WithSenderAndNonce
  ): Interaction {
    const interaction = this.xo.methods.withdrawOffer([offerID]);
    if (senderNonce.nonce) {
      interaction.withNonce(senderNonce.nonce);
    }
    interaction.withSender(new Address(senderNonce.address));
    return interaction.withChainID(this.api.chain).withGasLimit(15_000_000);
  }

  /**
   * Decline a custom offer
   *
   * @param offerID The offer ID
   * @returns {Interaction} The interaction object of the smart contract
   */

  public declineCustomOffer(
    offerID: number,
    sender: WithSenderAndNonce,
    nft?: NFTBody
  ): Interaction {
    const interaction = this.xo.methods.declineOffer([offerID]);
    if (sender.nonce) {
      interaction.withNonce(sender.nonce);
    }
    interaction.withSender(new Address(sender.address));
    if (nft) {
      interaction.withSingleESDTNFTTransfer(
        TokenTransfer.semiFungible(nft.collection, nft.nonce, nft.amount ?? 1)
      );
    }
    return interaction.withChainID(this.api.chain).withGasLimit(20_000_000);
  }

  /**
   * Accept a custom offer
   *
   * @param offerID The offer ID
   * @returns {Interaction} The interaction object of the smart contract
   */

  public acceptCustomOffer(
    offerID: number,
    sender: WithSenderAndNonce,
    nft?: NFTBody
  ): Interaction {
    const interaction = this.xo.methods.acceptOffer([offerID]);

    if (sender.nonce) {
      interaction.withNonce(sender.nonce);
    }
    interaction.withSender(new Address(sender.address));
    if (nft) {
      interaction.withSingleESDTNFTTransfer(
        TokenTransfer.semiFungible(nft.collection, nft.nonce, nft.amount ?? 1)
      );
    }
    return interaction.withChainID(this.api.chain).withGasLimit(30_000_000);
  }

  /**
   * @public
   * @function endAuction
   * @param {number} auctionID - The unique identifier of the auction.
   * @returns {Interaction} The resulting interaction with the specified chainID and gas limit.
   *
   * This function allows ending an auction by its auctionID. It takes the following parameter:
   * - auctionID (number): The unique identifier of the auction.
   *
   * The function calls the `endAuction` method on the smart contract with the provided auctionID.
   * Finally, it returns the resulting interaction with the specified chainID and gas limit.
   */

  public endAuction(
    auctionID: number,
    sender: WithSenderAndNonce,
    market = 'XO'
  ): Interaction {
    if (market == 'XO') {
      const interaction = this.xo.methods.endAuction([auctionID]);

      if (sender.nonce) {
        interaction.withNonce(sender.nonce);
      }
      interaction.withSender(new Address(sender.address));
      return interaction.withChainID(this.api.chain).withGasLimit(15_000_000);
    } else {
      throw new Error('Market not supported');
    }
  }

  /**
   * Bid on an auction
   *
   * @param auctionID The auction ID
   * @param collection The NFT Collection
   * @param nonce The NFT nonce
   * @param payment The payment object
   * @returns {Interaction} The interaction object of the smart contract
   */

  public bidOnAuctionId(
    auctionID: number,
    collection: string,
    nonce: number,
    payment: Payment,
    sender: WithSenderAndNonce
  ): Interaction {
    const interaction = this.xo.methods.bid([auctionID, collection, nonce]);
    if (!payment.amount) {
      throw new Error('Payment amount is required');
    }

    if (sender.nonce) {
      interaction.withNonce(sender.nonce);
    }
    interaction.withSender(new Address(sender.address));
    if (payment.collection == 'EGLD' && payment.amount) {
      interaction.withValue(TokenTransfer.egldFromAmount(payment.amount));
    } else {
      interaction.withSingleESDTTransfer(
        TokenTransfer.fungibleFromAmount(
          payment.collection,
          payment.amount,
          payment.decimals ?? 18
        )
      );
    }
    return interaction.withChainID(this.api.chain).withGasLimit(30_000_000);
  }

  /**
   * Bulk buy  auctions
   *
   * @param auctionIDs The auction IDs
   * @param payment The payment object
   * @returns {Interaction} The interaction object of the smart contract
   */

  public bulkBuy(
    auctionIDs: number[],
    payment: Payment,
    sender: WithSenderAndNonce
  ): Interaction {
    const interaction = this.xo.methods.bid(auctionIDs);

    if (sender.nonce) {
      interaction.withNonce(sender.nonce);
    }
    interaction.withSender(new Address(sender.address));
    if (!payment.amount) {
      throw new Error('Payment amount is required');
    }
    if (payment.collection == 'EGLD' && payment.amount) {
      interaction.withValue(TokenTransfer.egldFromAmount(payment.amount));
    } else {
      interaction.withSingleESDTTransfer(
        TokenTransfer.fungibleFromAmount(
          payment.collection,
          payment.amount,
          payment.decimals ?? 18
        )
      );
    }
    return interaction
      .withChainID(this.api.chain)
      .withGasLimit(
        Math.min(600_000_000, 20_000_000 + auctionIDs.length * 5_000_000)
      );
  }

  /**
   * @public
   * @async
   * @function buyAuctionById
   * @param {Object} options - An object containing the necessary parameters to buy an auction.
   * @param {number} options.auctionID - The unique identifier of the auction.
   * @param {string} [options.collection] - The collection the auctioned token belongs to (optional).
   * @param {number} [options.nonce] - The nonce of the auctioned token (optional).
   * @param {number} [options.quantity=1] - The quantity of tokens to buy (default is 1).
   * @param {string} [options.token='EGLD'] - The payment token (default is 'EGLD').
   * @param {number} [options.paymentAmount] - The payment amount for the auction (optional).
   * @param {boolean} [options.withCheck=true] - Whether to check the auction information (default is true).
   * @param {boolean} [options.isBigUintPayment=false] - Whether the payment amount is a big integer (default is false).
   * @returns {Promise<Interaction>} The resulting interaction with the specified chainID and gas limit.
   *
   * This function allows a user to buy an auction by its auctionID. It takes an object with the following properties:
   * - auctionID (number): The unique identifier of the auction.
   * - collection (string, optional): The collection the auctioned token belongs to.
   * - nonce (number, optional): The nonce of the auctioned token.
   * - quantity (number, optional): The quantity of tokens to buy (default is 1).
   * - token (string, optional): The payment token (default is 'EGLD').
   * - paymentAmount (number, optional): The payment amount for the auction.
   * - withCheck (boolean, optional): Whether to check the auction information (default is true).
   * - isBigUintPayment (boolean, optional): Whether the payment amount is a big integer (default is false).
   *
   * The function first checks if the auction exists and if its type is NFT or SftOnePerPayment. If not, an error is thrown.
   * Then, it calculates the payment amount and calls the `buy` method on the smart contract with the provided parameters.
   * Finally, the function returns the resulting interaction with the specified chainID and gas limit.
   */
  public async buyAuctionById({
    auctionID,
    collection,
    nonce,
    paymentAmount,
    quantity = 1,
    token = 'EGLD',
    withCheck = true,
    isBigUintPayment = false,
    address,
    nonce: senderNonce,
    isBid = false,
    decimals = 18,
    market = 'XO',
  }: {
    auctionID: number;
    collection?: string;
    nonce?: number;
    quantity?: number;
    token?: string;
    paymentAmount?: number;
    withCheck?: boolean;
    isBigUintPayment?: boolean;
    isBid?: boolean;
    market?: string;
    decimals?: number;
  } & WithSenderAndNonce): Promise<Interaction> {
    if (market !== 'XO') {
      throw new Error('Market not supported');
    }
    if (!auctionID) {
      throw new Error('AuctionID not provided');
    }
    let auction: Auction | null = null;
    if (!paymentAmount || !token || !collection || !nonce || withCheck) {
      auction = await this.getAuctionInfo(auctionID);
      if (auction === null) {
        throw new Error('Auction not found');
      }
      if (
        auction.auction_type === AuctionType.Nft ||
        auction.auction_type === AuctionType.SftOnePerPayment
      ) {
        throw new Error('Auction type is not NFT or SftOnePerPayment');
      }
    }
    const paymentToken = auction?.payment_token_type ?? token;
    const bigNumber = auction ? true : isBigUintPayment;
    let amount = isBid
      ? auction?.max_bid ?? paymentAmount
      : auction?.min_bid ?? paymentAmount;
    if (!amount) {
      throw new Error('Payment amount not provided');
    }

    const interaction = this.xo.methods.buy([
      auctionID,
      auction?.auctioned_token_type ?? collection,
      auction?.auctioned_token_nonce ?? nonce,
      quantity ?? 1,
    ]);

    if (senderNonce) {
      interaction.withNonce(senderNonce);
    }
    interaction.withSender(new Address(address));
    if (token === 'EGLD') {
      interaction.withValue(
        bigNumber
          ? TokenTransfer.egldFromBigInteger(
              new BigNumber(amount).multipliedBy(quantity)
            )
          : TokenTransfer.egldFromAmount(
              new BigNumber(amount).multipliedBy(quantity)
            )
      );
    } else {
      if (!bigNumber) {
        auction = await this.getAuctionInfo(auctionID);
        if (auction === null) {
          throw new Error('Auction not found');
        }
        amount = isBid ? auction.max_bid : auction.min_bid;
      }
      interaction.withSingleESDTTransfer(
        TokenTransfer.fungibleFromBigInteger(paymentToken, amount, decimals)
      );
    }

    return interaction.withChainID(this.api.chain).withGasLimit(20_000_000);
  }

  /**
   * @docutype
   * @public
   * @async
   * @function changeListing
   * @param {ChangeListing[]} listings - An array of objects containing the information needed to change a listing.
   * @returns {Interaction} The resulting interaction with the specified chainID and gas limit.
   *
   * This function takes an array of `ChangeListing` objects and constructs `Struct` instances using the provided
   * information. Each `ChangeListing` object should have the following properties:
   * - paymentToken (string): The identifier of the payment token type.
   * - price (BigInt): The new price for the listing.
   * - auctionID (number): The unique identifier of the auction.
   * - deadline (number): The deadline (in Unix time) for the listing.
   *
   * The function then calls the `changeListing` method on the smart contract and returns the resulting interaction
   * with the specified chainID and gas limit.
   */
  public async changeListing(
    listings: ChangeListing[],
    sender: WithSenderAndNonce
  ) {
    const fooType = new StructType('BulkUpdateListing', [
      new FieldDefinition('payment_token_type', '', new TokenIdentifierType()),
      new FieldDefinition('new_price', '', new BigUIntType()),
      new FieldDefinition('auction_id', '', new U64Type()),
      new FieldDefinition('deadline', '', new U64Type()),
    ]);
    const structs: Struct[] = [];
    listings.forEach(({ paymentToken, price, auctionID, deadline }) => {
      structs.push(
        new Struct(fooType, [
          new Field(
            new TokenIdentifierValue(paymentToken),
            'payment_token_type'
          ),
          new Field(new BigUIntValue(price), 'new_price'),
          new Field(new U64Value(auctionID), 'auction_id'),
          new Field(new U64Value(deadline), 'deadline'),
        ])
      );
    });
    const interaction = this.xo.methods.changeListing(structs);
    if (sender.nonce) {
      interaction.withNonce(sender.nonce);
    }
    interaction.withSender(new Address(sender.address));

    return interaction
      .withChainID(this.api.chain)
      .withGasLimit(
        Math.min(600_000_000, 8_000_000 + listings.length * 2_000_000)
      );
  }

  public async listNFTs(
    listings: NewListingArgs[],
    sender: WithSenderAndNonce
  ) {
    const fooType = new StructType('BulkListing', [
      new FieldDefinition('min_bid', '', new BigUIntType()),
      new FieldDefinition('max_bid', '', new BigUIntType()),
      new FieldDefinition('deadline', '', new U64Type()),
      new FieldDefinition(
        'accepted_payment_token',
        '',
        new TokenIdentifierType()
      ),
      new FieldDefinition('bid', '', new BooleanType()),
      new FieldDefinition('opt_sft_max_one_per_payment', '', new BooleanType()),
      new FieldDefinition('opt_start_time', '', new U64Type()),
      new FieldDefinition('collection', '', new TokenIdentifierType()),
      new FieldDefinition('nonce', '', new U64Type()),
      new FieldDefinition('nft_amount', '', new BigUIntType()),
    ]);
    const structs: Struct[] = [];
    const tokens: any = [];
    listings.forEach((listing: NewListingArgs) => {
      const decimals = listing.accepted_payment_token_decimals ?? 18;
      const minBID = new BigNumber(listing.min_bid).shiftedBy(decimals);
      const maxBID = new BigNumber(listing.max_bid ?? 0).shiftedBy(decimals);

      tokens.push(
        TokenTransfer.semiFungible(
          listing.collection,
          listing.nonce,
          listing.nft_amount
        )
      );

      structs.push(
        new Struct(fooType, [
          new Field(new BigUIntValue(minBID), 'min_bid'),
          new Field(new BigUIntValue(maxBID), 'max_bid'),
          new Field(
            new U64Value(new BigNumber(listing.deadline ?? 0)),
            'deadline'
          ),
          new Field(
            new TokenIdentifierValue(listing.accepted_payment_token ?? 'EGLD'),
            'accepted_payment_token'
          ),
          new Field(new BooleanValue(listing.bid ?? false), 'bid'),
          new Field(
            new BooleanValue(listing.isSFTPack ?? false),
            'opt_sft_max_one_per_payment'
          ),
          new Field(
            new U64Value(
              new BigNumber(listing.opt_start_time ? listing.opt_start_time : 0)
            ),
            'opt_start_time'
          ),
          new Field(new TokenIdentifierValue(listing.collection), 'collection'),
          new Field(new U64Value(listing.nonce), 'nonce'),
          new Field(
            new BigUIntValue(new BigNumber(listing.nft_amount)),
            'nft_amount'
          ),
        ])
      );
    });

    const interaction = this.xo.methods.listings(structs);
    if (sender.nonce) {
      interaction.withNonce(sender.nonce);
    }
    interaction.withSender(new Address(sender.address));
    interaction.withMultiESDTNFTTransfer(tokens);
    return interaction
      .withChainID(this.api.chain)
      .withGasLimit(
        Math.min(600_000_000, 8_000_000 + listings.length * 2_000_000)
      );
  }
}
