import * as React from 'react';
import * as _ from 'lodash';
import BigNumber from "bignumber.js";
import {Button, Dropdown, Form, Input, Message} from "semantic-ui-react";
import {ParaSwap, APIError, Token, User, OptimalRates, Transaction} from "paraswap";
import Web3 = require("web3");

const pkg = require('../package');

// @ts-ignore
import C3Chart from 'react-c3js';

//import {injected, network,} from "./connectors";

declare let web3: any;

const PROVIDER_URL = process.env.PROVIDER_URL;
const apiURL = process.env.API_URL || 'https://paraswap.io/api/v1';

const DEFAULT_ALLOWED_SLIPPAGE = 0.005;//0.5%

//TODO: use the referrer name you like
const REFERRER = pkg.name;

const PAIR = {from: 'ETH', to: 'DAI', amount: '1'};

interface IState {
  loading: boolean,
  error: string,
  tokens: Token[],
  srcAmount: string,
  priceRoute?: OptimalRates,
  user?: User,
  payTo?: string,
  tokenFrom?: Token,
  tokenTo?: Token,
  transactionHash?: string,
}

export default class Swapper extends React.Component<any, IState> {
  paraSwap?: ParaSwap;
  provider: Web3;

  constructor(props: any) {
    super(props);

    this.state = {
      error: '',
      loading: false,
      tokens: [],
      srcAmount: '1',
      payTo: '',
      transactionHash: ''
    };

    this.provider = new Web3(new Web3.providers.HttpProvider(PROVIDER_URL!));
  }

  isValidAddress(address: string) {
    return this.provider.utils.isAddress(address);
  }

  getDestAmount = () => {
    const {priceRoute, tokenTo} = this.state;

    if (!priceRoute) {
      return '';
    }

    const destAmount = new BigNumber(priceRoute.amount).dividedBy(10 ** tokenTo!.decimals);

    if (destAmount.isNaN()) {
      return '';
    }

    return destAmount.toFixed();
  };

  getSrcAmount = (value: string) => {
    if (_.isNaN(Number(value))) {
      return this.state.srcAmount;
    }
    return value;
  };

  setSrcAmount = (value: string) => {
    const srcAmount = this.getSrcAmount(value)

    this.setState(
      {srcAmount, priceRoute: undefined},
      () => this.getBestPrice(srcAmount)
    );
  };

  switch = () => {
    const {tokenFrom, tokenTo} = this.state;
    this.setState({tokenFrom: tokenTo, tokenTo: tokenFrom});
  };

  getAllowance = async (token: Token) => {
    try {
      const {user} = this.state;

      this.setState({loading: true});

      const allowance = await this.paraSwap!.getAllowance(user!.address, token.address, user!.network);

      const tokenWithAllowance = new Token(token.address, token.decimals, token.symbol, allowance);

      this.setState({tokenFrom: tokenWithAllowance});

      this.setState({loading: false});
    } catch (e) {
      this.setState({error: e.toString(), loading: false});
    }
  };

  needsAllowance = () => {
    const {tokenFrom, priceRoute} = this.state;

    if (tokenFrom!.symbol === 'ETH') {
      return false;
    }

    return (
      new BigNumber(priceRoute!.amount).isGreaterThan(new BigNumber(tokenFrom!.allowance!))
    )
  };

  updatePair = (fromOrTo: 'from' | 'to', symbol: string) => {
    if (fromOrTo === 'from') {
      if (symbol === this.state.tokenTo!.symbol) {
        this.switch();
      }

      const tokenFrom = this.state.tokens.find(t => t.symbol === symbol);

      this.setState(
        {tokenFrom, priceRoute: undefined},
        () => this.getBestPrice(this.state.srcAmount)
      );

      if (symbol.toUpperCase() !== "ETH") {
        this.getAllowance(tokenFrom!);
      }

    } else {
      if (symbol === this.state.tokenFrom!.symbol) {
        this.switch();
      }

      this.setState(
        {priceRoute: undefined, tokenTo: this.state.tokens.find(t => t.symbol === symbol)},
        () => this.getBestPrice(this.state.srcAmount)
      );
    }
  };

  onPayToChanged = (e: any) => {
    const payTo = e.target.value;
    this.setState({payTo});

    if (payTo && !this.isValidAddress(payTo)) {
      this.setState({error: 'Invalid pay address'});
    } else {
      this.setState({error: ''});
    }
  };

  getTokens = async () => {
    try {
      this.setState({loading: true});

      const tokensOrError = await this.paraSwap!.getTokens();


      if ((tokensOrError as APIError).message) {
        return this.setState({error: (tokensOrError as APIError).message, loading: false});
      }

      let tokens: Token[] = tokensOrError as Token[];
      //console.log(tokens);

      let excludeToken = ['c', 'a', 's', 'i', 'p', 'b'];
      let tokens2 = [];
      for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        let symbol = token.symbol;
        let checkChar = symbol.split('');
        var checkExcludeToken = excludeToken.includes(checkChar[0], 0);
        if (checkExcludeToken) {
          //data.tokens.splice(i, 1);
        } else {
          tokens2.push(token);
        }
      }
      console.log(tokens2);
      tokens = tokens2;


      const tokenFrom = tokens2.find(t => t.symbol === PAIR.from);
      const tokenTo = tokens2.find(t => t.symbol === PAIR.to);

      this.setState({tokens, tokenFrom, tokenTo, loading: false});

    } catch (e) {
      console.error(e);
      this.setState({error: e.toString(), loading: false});
    }

  };

  getBestPrice = async (srcAmount: string) => {
    try {
      this.setState({error: '', priceRoute: undefined});

      const {tokenFrom, tokenTo} = this.state;

      const _srcAmount = new BigNumber(srcAmount).times(10 ** tokenFrom!.decimals);

      if (_srcAmount.isNaN() || _srcAmount.isLessThanOrEqualTo(0)) {
        return;
      }

      this.setState({loading: true});

      let options = {
        "excludeDEXS": 'PARASWAPPOOL,AAVE,CHAI,MakerDAO,BZX,COMPOUND',
        "includeDEXS": 'KYBER,UNISWAP,BANCOR,Oasis,ZEROX'
      };
      // @ts-ignore
      const priceRouteOrError = await this.paraSwap!.getRate(tokenFrom!.address, tokenTo!.address, _srcAmount.toFixed(0), options);
      //console.log(priceRouteOrError);

      let excludeExchange = ['PARASWAPPOOL', 'AAVE', 'CHAI', 'MAKERDAO', 'BZX', 'COMPOUND'];
      let bestRoute_2 = [];
      for (let i = 0; i < priceRouteOrError.bestRoute.length; i++) {
        let checkExchange = priceRouteOrError.bestRoute[i];
        let exchange = checkExchange.exchange.toUpperCase();
        var checkExcludeExchange = excludeExchange.includes(exchange, 0);
        if (checkExcludeExchange) {
          //data.tokens.splice(i, 1);
        } else {
          bestRoute_2.push(checkExchange);
        }
      }
      priceRouteOrError.bestRoute = bestRoute_2;
      //console.log(priceRouteOrError);

      if ((priceRouteOrError as APIError).message) {
        return this.setState({error: (priceRouteOrError as APIError).message, loading: false});
      }

      const priceRoute = priceRouteOrError as OptimalRates;

      this.setState({loading: false, priceRoute});

    } catch (e) {
      this.setState({error: "Price Feed Error", loading: false});
    }
  };

  setAllowance = async () => {
    const {user, tokenFrom, srcAmount} = this.state;

    try {
      const amount = new BigNumber(srcAmount).times(10 ** tokenFrom!.decimals).toFixed(0);

      const transactionHash = await this.paraSwap!.approveToken(amount, user!.address, tokenFrom!.address, user!.network);

      console.log('transactionHash', transactionHash);
      this.setState({transactionHash});

    } catch (e) {
      this.setState({error: e.toString(), loading: false});
    }
  };

  swapOrPay = async () => {
    const {user, tokenFrom, tokenTo, srcAmount, priceRoute, payTo} = this.state;

    try {
      this.setState({loading: true, error: ''});

      const _srcAmount = new BigNumber(srcAmount).times(10 ** tokenFrom!.decimals).toFixed(0);

      const minDestinationAmount = new BigNumber(priceRoute!.amount).multipliedBy(1 - DEFAULT_ALLOWED_SLIPPAGE);

      const txParams = await this.paraSwap!.buildTx(
        tokenFrom!.address, tokenTo!.address, _srcAmount, minDestinationAmount.toFixed(), priceRoute!, user!.address, REFERRER, payTo
      );

      if ((txParams as APIError).message) {
        return this.setState({error: (txParams as APIError).message, loading: false});
      }

      await this.provider.eth.sendTransaction((txParams as Transaction), async (err: any, transactionHash: string) => {
        if (err) {
          return this.setState({error: err.toString(), loading: false});
        }

        console.log('transactionHash', transactionHash);
        this.setState({transactionHash});
      });

      this.setState({loading: false});
    } catch (e) {
      this.setState({error: e.message, loading: false});
      console.error("ERROR", e);
    }
  };

  async componentDidMount() {
    const {srcAmount} = this.state;

    if (typeof web3 !== 'undefined') {
      const addresses = await web3.currentProvider.enable();

      const {networkVersion} = web3.currentProvider;
      const user = new User(addresses[0], networkVersion);
      this.setState({user});

      const network = Number(networkVersion);

      this.paraSwap = new ParaSwap(network, apiURL);

      this.provider = new Web3(web3.currentProvider);

      await this.getTokens();
      await this.getBestPrice(srcAmount);
    } else {
      this.paraSwap = new ParaSwap(1, apiURL);

      await this.getTokens();
      await this.getBestPrice(srcAmount);
    }
  }

  render() {
    const {tokens, tokenFrom, tokenTo, srcAmount, priceRoute, payTo, user, loading, error, transactionHash} = this.state;

    const options = tokens.map((t: Token) => ({
      key: t.symbol,
      text: t.symbol,
      value: t.symbol
    }));

    const bestRoute = priceRoute && priceRoute.bestRoute.filter((pr: any) => !!Number(pr.srcAmount)) || [];

    const c3Data = {columns: bestRoute.map((br: any) => [br.exchange, br.percent]) || [], type: 'gauge'};

    return (
      <div className={"app"}>
        {
          error ? (
            <Message negative icon>

              <Message.Content>
                <Message.Content>{error}</Message.Content>
              </Message.Content>
            </Message>
          ) : null
        }

        {
          (user && user.address) ? (
            <Message info>
              <Message.Header>
                Connected
              </Message.Header>
              <Message.Content>
                {user.address}
              </Message.Content>
            </Message>
          ) : null
        }

        {
          transactionHash ? (
            <Message info>
              <a target={'_blank'} href={`https://etherscan.io/tx/${transactionHash}`}>Track transaction</a>
            </Message>
          ) : null
        }

        <div style={{textAlign: 'center', paddingBottom: 20,}}>
          <label style={{fontSize: 25, fontWeight: 'bold', color: '#24323a', letterSpacing: 3,}}> START A SWAP</label>
        </div>
        <Form>
          <div className={"left-content"}>
            <Form.Field>
              {
                priceRoute ? (
                  <C3Chart className={'distribution-chart'} data={c3Data}/>
                ) : null
              }
            </Form.Field>

            {/* <Form.Field>
              {
                priceRoute ? (
                  <Segment.Group horizontal>
                    {
                      bestRoute.map((pr: any) => (
                        <Segment key={pr.exchange}>{pr.exchange} {pr.percent}%</Segment>
                      ))
                    }
                  </Segment.Group>
                ) : null
              }

            </Form.Field> */}
          </div>
          <div className={"right-content"}>
            <Form.Field>
              <label>
                From
                <Input
                  autoFocus={true}
                  onChange={(e: any) => this.setSrcAmount(e.target.value)}
                  value={srcAmount.toString()}
                  placeholder='Amount'
                />
              </label>
            </Form.Field>

            <Form.Field>
              <Dropdown
                style={{top: -15, right: 0, width: 50,}}
                placeholder='From'
                search
                selection
                options={options}
                value={tokenFrom && tokenFrom.symbol}
                onChange={(_: any, data: any) => this.updatePair('from', data.value)}
              />
            </Form.Field>

            <Form.Field>
              <Dropdown
                style={{top: 50, right: 0, width: 50, zIndex: 3,}}
                placeholder='To'
                search
                selection
                options={options}
                value={tokenTo && tokenTo.symbol}
                onChange={(_: any, data: any) => this.updatePair('to', data.value)}
              />
            </Form.Field>

            <Form.Field>
              <label>
                To
                <Input
                  value={this.getDestAmount()}
                  placeholder='Amount'
                />
              </label>
            </Form.Field>
            <Form.Field>
              <label>
                Pay To (Optional)
                <Input
                  className={'pay-to'}
                  onChange={this.onPayToChanged}
                  value={payTo}
                  placeholder='Enter Address'
                />
              </label>
            </Form.Field>
            <div>
            </div>
            <div className={"button-wrapper"}>
              <Form.Field>
                <Button
                  loading={loading}
                  onClick={() => this.getBestPrice(srcAmount)} primary fluid>
                  GET RATES
                </Button>
              </Form.Field>

              <Form.Field>
                {
                  (tokenFrom && priceRoute && this.needsAllowance()) ? (
                    <Button
                      positive
                      disabled={loading || !priceRoute}
                      onClick={() => this.setAllowance()} primary fluid>
                      APPROVE TOKEN
                    </Button>
                  ) : (
                    <Button
                      positive
                      disabled={loading || !priceRoute}
                      onClick={() => this.swapOrPay()} primary fluid>
                      {
                        payTo ? 'PAY' : 'SWAP'
                      }
                    </Button>
                  )
                }

              </Form.Field>
            </div>
          </div>
        </Form>
      </div>
    )
  }
}
