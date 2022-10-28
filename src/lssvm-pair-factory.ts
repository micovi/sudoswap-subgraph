import { BigDecimal, BigInt } from "@graphprotocol/graph-ts"
// import { decodeEthFunctionInputs } from "./helpers"
import {
  LSSVMPairFactory,
  BondingCurveStatusUpdate as BondingCurveStatusUpdateEvent,
  CallTargetStatusUpdate,
  NFTDeposit as NFTDepositEvent,
  NewPair as NewPairEvent,
  OwnershipTransferred,
  ProtocolFeeMultiplierUpdate,
  ProtocolFeeRecipientUpdate,
  RouterStatusUpdate,
  TokenDeposit as TokenDepositEvent,
  CreatePairETHCall
} from "../generated/LSSVMPairFactory/LSSVMPairFactory"
import { NewPair, Pair, NFT, DailyETHPairStat, DailyETHPoolStat, DailyETHProtocolStat, BondingCurveStatusUpdate, ProtocolFeeMultiplier, NFTDeposit, TokenDeposit } from "../generated/schema"
import { LSSVMPairEnumerableETH } from "../generated/templates"
import { plusBigInt, updatePairAttributesIfMissing } from "./utilities"
import { ethers } from "ethers"
import chains from "../chains.json";
import ERC721ABI from "../abis/ERC721.json";

const CHAIN = chains[9990];

const provider = new ethers.providers.JsonRpcProvider({
  url: CHAIN.rpcUrls.default,
});

export async function handleCreatePairETH(
  event: CreatePairETHCall
): void {
  let newPair = NewPair.load(event.transaction.hash.toHexString())
  // todo: initial and current pair attributes/counts
  if (!newPair) {
    newPair = new NewPair(event.transaction.hash.toHexString())
  }

  let newNFT = NFT.load(event.inputs._nft.toHexString());

  if (!newNFT) {
    const nftContract = new ethers.Contract(event.inputs._nft.toHexString(), ERC721ABI, provider);

    const name = await nftContract.name()
    const symbol = await nftContract.symbol()

    newNFT = new NFT(event.inputs._nft.toHexString());
    newNFT.contractAddress = event.inputs._nft.toHexString();
    newNFT.name = name;
    newNFT.symbol = symbol;
    newNFT.save();
  }

  newPair.nft = newNFT.id;
  newPair.initialBondingCurveAddress = event.inputs._bondingCurve.toHexString()
  newPair.initialAssetRecipient = event.inputs._assetRecipient.toHexString()
  newPair.poolType = BigInt.fromI32(event.inputs._poolType)
  newPair.initialDelta = event.inputs._delta
  newPair.initialFeeMultiplier = event.inputs._fee.toBigDecimal().div(BigDecimal.fromString((Math.pow(10, 18)).toString()))
  newPair.initialSpotPrice = event.inputs._spotPrice
  newPair.initialNFTIdInventory = event.inputs._initialNFTIDs
  newPair.initialInventoryCount = BigInt.fromI32(event.inputs._initialNFTIDs.length)
  newPair.initialETHLiquidity = event.transaction.value
  newPair.owner = event.from.toHexString()
  newPair.save()
  const dayString = new Date(event.block.timestamp.toI64() * 1000).toISOString().slice(0, 10).replaceAll("-", "")
  let poolStats = DailyETHPoolStat.load(newPair.nft + "-" + dayString)
  // todo: initial and current pair attributes/counts
  if (!poolStats) {
    poolStats = new DailyETHPoolStat(newPair.nft + "-" + dayString)
    poolStats.dayString = dayString
    poolStats.nftContract = newPair.nft
  }
  poolStats.ethDeposited = plusBigInt(event.transaction.value, poolStats.ethDeposited)
  poolStats.nftsDeposited = plusBigInt(BigInt.fromI32(event.inputs._initialNFTIDs.length), poolStats.nftsDeposited)
  poolStats.save()
  let protocolStats = DailyETHProtocolStat.load(dayString)
  if (!protocolStats) {
    protocolStats = new DailyETHProtocolStat(dayString)
    protocolStats.dayString = dayString
  }
  protocolStats.ethDeposited = plusBigInt(event.transaction.value, protocolStats.ethDeposited)
  protocolStats.nftsDeposited = plusBigInt(BigInt.fromI32(event.inputs._initialNFTIDs.length), protocolStats.nftsDeposited)
  protocolStats.numPairsCreated = plusBigInt(BigInt.fromI32(1), protocolStats.numPairsCreated)
  protocolStats.save()

  // protocolStats.numPoolsCreated = plusBigInt(BigInt.fromI32(1), protocolStats.numPoolsCreated)
}

export function handleNewPairEvent(event: NewPairEvent): void {
  LSSVMPairEnumerableETH.create(event.params.poolAddress)
  let pair = Pair.load(event.params.poolAddress.toHexString())
  if (!pair) {
    pair = new Pair(event.params.poolAddress.toHexString())
  }
  pair.createdAt = event.block.timestamp
  pair.updatedAt = event.block.timestamp
  pair.createdTx = event.transaction.hash.toHexString()
  pair.owner = event.transaction.from.toHexString()
  pair.initialAttributes = event.transaction.hash.toHexString()
  pair.save()
}

export function handleBondingCurveStatusUpdate(
  event: BondingCurveStatusUpdateEvent
): void { }

export function handleNFTDeposit(event: NFTDepositEvent): void {
  let entity = new NFTDeposit(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  )
  let pair = updatePairAttributesIfMissing(Pair.load(event.params.poolAddress.toHexString())!)
  pair.inventoryCount = pair.inventoryCount!.plus(BigInt.fromI32(1))
  entity.timestamp = event.block.timestamp
  entity.pair = event.params.poolAddress.toHexString()
  entity.save()

  const dayString = new Date(event.block.timestamp.toI64() * 1000).toISOString().slice(0, 10).replaceAll("-", "")
  let dailyETHProtocolStats = DailyETHProtocolStat.load(dayString)
  if (!dailyETHProtocolStats) {
    dailyETHProtocolStats = new DailyETHProtocolStat(dayString)
    dailyETHProtocolStats.nftsDeposited = BigInt.fromI32(0)
  }
  dailyETHProtocolStats.nftsDeposited = plusBigInt(dailyETHProtocolStats.nftsDeposited, BigInt.fromI32(1))

  let dailyPairStats = DailyETHPairStat.load(pair.id + "-" + dayString)
  if (!dailyPairStats) {
    dailyPairStats = new DailyETHPairStat(pair.id + "-" + dayString)
    dailyPairStats.nftsDeposited = BigInt.fromI32(0)
  }
  dailyPairStats.nftsDeposited = plusBigInt(dailyPairStats.nftsDeposited, BigInt.fromI32(1))

  let dailyPoolStats = DailyETHPoolStat.load(pair.nft + "-" + dayString)
  if (!dailyPoolStats) {
    dailyPoolStats = new DailyETHPoolStat(pair.nft + "-" + dayString)
    dailyPoolStats.nftsDeposited = BigInt.fromI32(0)
  }
  dailyPoolStats.nftsDeposited = plusBigInt(dailyPoolStats.nftsDeposited, BigInt.fromI32(1))
  dailyETHProtocolStats.save()
  dailyPairStats.save()
  dailyPoolStats.save()
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void { }

export function handleProtocolFeeMultiplierUpdate(
  event: ProtocolFeeMultiplierUpdate
): void {
  let protocolFee = new ProtocolFeeMultiplier("current")
  protocolFee.protocolFeeMultiplier = event.params.newMultiplier.toBigDecimal().div(BigDecimal.fromString((Math.pow(10, 18)).toString()))
  protocolFee.save()
}

export function handleProtocolFeeRecipientUpdate(
  event: ProtocolFeeRecipientUpdate
): void { }

export function handleRouterStatusUpdate(event: RouterStatusUpdate): void { }

export function handleTokenDeposit(event: TokenDepositEvent): void {
  let entity = new TokenDeposit(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  let pair = updatePairAttributesIfMissing(Pair.load(event.params.poolAddress.toHexString())!)
  entity.amountDeposited = event.transaction.value
  entity.pair = event.params.poolAddress.toHexString()
  entity.timestamp = event.block.timestamp
  pair.ethLiquidity = pair.ethLiquidity!.plus(event.transaction.value)
  entity.save()

  const dayString = new Date(event.block.timestamp.toI64() * 1000).toISOString().slice(0, 10).replaceAll("-", "")
  let dailyETHProtocolStats = DailyETHProtocolStat.load(dayString)
  if (!dailyETHProtocolStats) {
    dailyETHProtocolStats = new DailyETHProtocolStat(dayString)
    dailyETHProtocolStats.ethDeposited = BigInt.fromI32(0)
  }
  dailyETHProtocolStats.ethDeposited = plusBigInt(dailyETHProtocolStats.ethDeposited, entity.amountDeposited)

  let dailyPairStats = DailyETHPairStat.load(pair.id + "-" + dayString)
  if (!dailyPairStats) {
    dailyPairStats = new DailyETHPairStat(pair.id + "-" + dayString)
    dailyPairStats.ethDeposited = BigInt.fromI32(0)
  }
  dailyPairStats.ethDeposited = plusBigInt(dailyPairStats.ethDeposited, entity.amountDeposited)

  let dailyPoolStats = DailyETHPoolStat.load(pair.nft + "-" + dayString)
  if (!dailyPoolStats) {
    dailyPoolStats = new DailyETHPoolStat(pair.nft + "-" + dayString)
    dailyPoolStats.ethDeposited = BigInt.fromI32(0)
  }
  dailyPoolStats.ethDeposited = plusBigInt(dailyPoolStats.ethDeposited, entity.amountDeposited)
  dailyETHProtocolStats.save()
  dailyPairStats.save()
  dailyPoolStats.save()
}
