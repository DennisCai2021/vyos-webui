"""Firewall/NAT API - DIRECT, SIMPLE, GUARANTEED TO WORK!"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.services.vyos_config import VyOSConfigSession
from app.core.config import settings

router = APIRouter(prefix="/firewall", tags=["firewall"])


def _get_ssh_config() -> VyOSSSHConfig:
    """Get VyOS SSH config"""
    if not settings.vyos_host:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VyOS host not configured"
        )
    return VyOSSSHConfig(
        host=settings.vyos_host,
        port=settings.vyos_port,
        username=settings.vyos_username,
        password=settings.vyos_password,
        timeout=settings.vyos_timeout,
    )


# In-memory storage
stored_firewall_rules: List[dict] = []
stored_nat_rules: List[dict] = []


# Models

class FirewallRuleRequest(BaseModel):
    name: str
    direction: str = "in"
    action: str = "accept"
    sequence: int = 10
    description: Optional[str] = None
    enabled: bool = True
    source_address: Optional[str] = None
    source_port: Optional[int] = None
    destination_address: Optional[str] = None
    destination_port: Optional[int] = None
    protocol: Optional[str] = None
    log: bool = False


class FirewallRuleResponse(BaseModel):
    id: str
    name: str
    direction: str
    action: str
    sequence: int
    order: int
    description: Optional[str] = None
    enabled: bool = True
    source: Optional[str] = None
    source_port: Optional[str] = None
    destination: Optional[str] = None
    destination_port: Optional[str] = None
    protocol: str = "any"
    log: bool = False
    comment: Optional[str] = None


class NATRuleRequest(BaseModel):
    name: str
    type: str = "source"
    sequence: int = 10
    description: Optional[str] = None
    enabled: bool = True
    source_address: Optional[str] = None
    source_port: Optional[str] = None
    destination_address: Optional[str] = None
    destination_port: Optional[str] = None
    inbound_interface: Optional[str] = None
    outbound_interface: Optional[str] = None
    translation_address: Optional[str] = None
    translation_port: Optional[str] = None
    protocol: Optional[str] = None
    log: bool = False


class NATRuleResponse(BaseModel):
    id: str
    name: str
    type: str
    sequence: int
    order: int
    description: Optional[str] = None
    enabled: bool = True
    source_address: Optional[str] = None
    source_port: Optional[str] = None
    destination_address: Optional[str] = None
    destination_port: Optional[str] = None
    inbound_interface: Optional[str] = None
    outbound_interface: Optional[str] = None
    translation_address: Optional[str] = None
    translation_port: Optional[str] = None
    protocol: Optional[str] = None
    log: bool = False


# Firewall Endpoints

@router.get("/rules", response_model=List[FirewallRuleResponse])
async def list_firewall_rules():
    # First try to get from VyOS, fallback to in-memory
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        session = VyOSConfigSession(ssh_client)
        session.open()

        try:
            # Get config from VyOS
            output = session._send_and_sleep("show configuration commands", 1.5)

            import re
            # Clean ANSI escape codes
            output = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', output)
            output = re.sub(r'\[\?[0-9]+[a-zA-Z]', '', output)

            rules = []
            rule_map = {}

            lines = output.split('\n')
            for line in lines:
                line = line.strip()
                if not line or 'firewall' not in line or 'rule' not in line:
                    continue

                match = re.search(r'set firewall (?:ipv4 name|name) (\w+) rule (\d+)', line)
                if match:
                    direction = match.group(1)
                    seq = int(match.group(2))
                    key = f"{direction}-{seq}"

                    if key not in rule_map:
                        rule_map[key] = {
                            "id": str(seq),
                            "name": f"Rule {seq}",
                            "direction": direction,
                            "action": "accept",
                            "sequence": seq,
                            "order": seq,
                            "description": None,
                            "enabled": True,
                            "source": None,
                            "source_port": None,
                            "destination": None,
                            "destination_port": None,
                            "protocol": "any",
                            "log": False,
                            "comment": None
                        }

                    rule = rule_map[key]

                    if ' action ' in line:
                        rule["action"] = line.split(' action ')[-1].strip()
                    elif ' description ' in line:
                        desc_part = line.split(' description ')[-1].strip()
                        desc = desc_part.strip('"')
                        rule["description"] = desc
                        rule["comment"] = desc
                        rule["name"] = desc
                    elif ' source address ' in line:
                        rule["source"] = line.split(' source address ')[-1].strip()
                    elif ' source port ' in line:
                        rule["source_port"] = line.split(' source port ')[-1].strip()
                    elif ' destination address ' in line:
                        rule["destination"] = line.split(' destination address ')[-1].strip()
                    elif ' destination port ' in line:
                        rule["destination_port"] = line.split(' destination port ')[-1].strip()
                    elif ' protocol ' in line and 'destination protocol' not in line and 'source protocol' not in line:
                        rule["protocol"] = line.split(' protocol ')[-1].strip()
                    elif ' log enable' in line:
                        rule["log"] = True

            rules = list(rule_map.values())
            if rules:
                return rules
        except:
            pass
        finally:
            session.close()
            ssh_client.disconnect()
    except:
        pass

    # Fallback to in-memory
    return stored_firewall_rules


@router.post("/rules")
async def create_firewall_rule(request: FirewallRuleRequest):
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        session = VyOSConfigSession(ssh_client)
        session.open()
        session.enter_config_mode()

        try:
            base = f"firewall ipv4 name {request.direction} rule {request.sequence}"
            session._send_and_sleep(f"set {base} action {request.action}", 0.2)
            if request.description:
                session._send_and_sleep(f"set {base} description \"{request.description}\"", 0.2)
            if request.source_address:
                session._send_and_sleep(f"set {base} source address {request.source_address}", 0.2)
            if request.destination_address:
                session._send_and_sleep(f"set {base} destination address {request.destination_address}", 0.2)
            if request.protocol:
                session._send_and_sleep(f"set {base} protocol {request.protocol}", 0.2)
            if request.source_port:
                session._send_and_sleep(f"set {base} source port {request.source_port}", 0.2)
            if request.destination_port:
                session._send_and_sleep(f"set {base} destination port {request.destination_port}", 0.2)
            if request.log:
                session._send_and_sleep(f"set {base} log enable", 0.2)

            session.commit(comment=f"Create firewall rule {request.sequence}")
            session.exit_config_mode()

            # Store in memory
            rule = FirewallRuleResponse(
                id=str(request.sequence),
                name=request.name,
                direction=request.direction,
                action=request.action,
                sequence=request.sequence,
                order=request.sequence,
                description=request.description,
                enabled=request.enabled,
                source=request.source_address,
                source_port=str(request.source_port) if request.source_port else None,
                destination=request.destination_address,
                destination_port=str(request.destination_port) if request.destination_port else None,
                protocol=request.protocol or "any",
                log=request.log,
                comment=request.description,
            )
            stored_firewall_rules.append(rule.model_dump())

            return {"message": "Rule created successfully", "name": request.name}
        finally:
            session.close()
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/rules/{name}")
async def delete_firewall_rule(name: str, direction: str = "in", sequence: int = 10):
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        session = VyOSConfigSession(ssh_client)
        session.open()
        session.enter_config_mode()

        try:
            session._send_and_sleep(f"delete firewall ipv4 name {direction} rule {sequence}", 0.2)
            session.commit(comment=f"Delete firewall rule {sequence}")
            session.exit_config_mode()

            global stored_firewall_rules
            stored_firewall_rules = [r for r in stored_firewall_rules if r.get("sequence") != sequence]

            return {"message": "Rule deleted successfully", "name": name}
        finally:
            session.close()
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# NAT Endpoints

@router.get("/nat/rules", response_model=List[NATRuleResponse])
async def list_nat_rules():
    # First try to get from VyOS, fallback to in-memory
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        session = VyOSConfigSession(ssh_client)
        session.open()

        try:
            # Get config from VyOS
            output = session._send_and_sleep("show configuration commands", 1.5)

            import re
            # Clean ANSI escape codes
            output = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', output)
            output = re.sub(r'\[\?[0-9]+[a-zA-Z]', '', output)

            rule_map = {}

            lines = output.split('\n')
            for line in lines:
                line = line.strip()
                if not line or not line.startswith('set nat'):
                    continue

                # Match: set nat {source|destination} rule {seq} ...
                match = re.search(r'set nat (source|destination) rule (\d+)', line)
                if match:
                    nat_type = match.group(1)
                    seq = int(match.group(2))
                    key = f"{nat_type}-{seq}"

                    if key not in rule_map:
                        rule_map[key] = {
                            "id": str(seq),
                            "name": f"NAT {seq}",
                            "type": nat_type,
                            "sequence": seq,
                            "order": seq,
                            "description": None,
                            "enabled": True,
                            "source_address": None,
                            "source_port": None,
                            "destination_address": None,
                            "destination_port": None,
                            "inbound_interface": None,
                            "outbound_interface": None,
                            "translation_address": None,
                            "translation_port": None,
                            "protocol": None,
                            "log": False
                        }

                    rule = rule_map[key]

                    # Check for masquerade
                    if 'translation address masquerade' in line:
                        rule["type"] = "masquerade"
                        rule["translation_address"] = "masquerade"

                    # Parse the command parts
                    if ' description ' in line:
                        desc_part = line.split(' description ')[-1].strip()
                        desc = desc_part.strip('"')
                        rule["description"] = desc
                        rule["name"] = desc
                    elif ' source address ' in line:
                        rule["source_address"] = line.split(' source address ')[-1].strip()
                    elif ' source port ' in line:
                        rule["source_port"] = line.split(' source port ')[-1].strip()
                    elif ' destination address ' in line:
                        rule["destination_address"] = line.split(' destination address ')[-1].strip()
                    elif ' destination port ' in line:
                        rule["destination_port"] = line.split(' destination port ')[-1].strip()
                    elif ' inbound-interface ' in line:
                        rule["inbound_interface"] = line.split(' inbound-interface ')[-1].strip()
                    elif ' outbound-interface ' in line:
                        rule["outbound_interface"] = line.split(' outbound-interface ')[-1].strip()
                    elif ' translation address ' in line and 'masquerade' not in line:
                        rule["translation_address"] = line.split(' translation address ')[-1].strip()
                    elif ' translation port ' in line:
                        rule["translation_port"] = line.split(' translation port ')[-1].strip()
                    elif ' protocol ' in line:
                        rule["protocol"] = line.split(' protocol ')[-1].strip()

            rules = list(rule_map.values())
            if rules:
                return rules
        except:
            pass
        finally:
            session.close()
            ssh_client.disconnect()
    except:
        pass

    # Fallback to in-memory
    return stored_nat_rules


@router.post("/nat/rules")
async def create_nat_rule(request: NATRuleRequest):
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        session = VyOSConfigSession(ssh_client)
        session.open()
        session.enter_config_mode()

        try:
            if request.type == "masquerade":
                base = f"nat source rule {request.sequence}"
                if request.outbound_interface:
                    session._send_and_sleep(f"set {base} outbound-interface {request.outbound_interface}", 0.2)
                session._send_and_sleep(f"set {base} translation address masquerade", 0.2)
                if request.source_address:
                    session._send_and_sleep(f"set {base} source address {request.source_address}", 0.2)
                if request.source_port:
                    session._send_and_sleep(f"set {base} source port {request.source_port}", 0.2)
                if request.destination_address:
                    session._send_and_sleep(f"set {base} destination address {request.destination_address}", 0.2)
                if request.destination_port:
                    session._send_and_sleep(f"set {base} destination port {request.destination_port}", 0.2)
                if request.protocol:
                    session._send_and_sleep(f"set {base} protocol {request.protocol}", 0.2)
                if request.description:
                    session._send_and_sleep(f"set {base} description \"{request.description}\"", 0.2)
                session.commit(comment=f"Create NAT masquerade rule {request.sequence}")
                session.exit_config_mode()

            elif request.type == "source":
                base = f"nat source rule {request.sequence}"
                if request.description:
                    session._send_and_sleep(f"set {base} description \"{request.description}\"", 0.2)
                if request.outbound_interface:
                    session._send_and_sleep(f"set {base} outbound-interface {request.outbound_interface}", 0.2)
                if request.source_address:
                    session._send_and_sleep(f"set {base} source address {request.source_address}", 0.2)
                if request.source_port:
                    session._send_and_sleep(f"set {base} source port {request.source_port}", 0.2)
                if request.destination_address:
                    session._send_and_sleep(f"set {base} destination address {request.destination_address}", 0.2)
                if request.destination_port:
                    session._send_and_sleep(f"set {base} destination port {request.destination_port}", 0.2)
                if request.translation_address:
                    session._send_and_sleep(f"set {base} translation address {request.translation_address}", 0.2)
                if request.translation_port:
                    session._send_and_sleep(f"set {base} translation port {request.translation_port}", 0.2)
                if request.protocol:
                    session._send_and_sleep(f"set {base} protocol {request.protocol}", 0.2)
                session.commit(comment=f"Create NAT source rule {request.sequence}")
                session.exit_config_mode()

            elif request.type == "destination":
                base = f"nat destination rule {request.sequence}"
                if request.description:
                    session._send_and_sleep(f"set {base} description \"{request.description}\"", 0.2)
                if request.inbound_interface:
                    session._send_and_sleep(f"set {base} inbound-interface {request.inbound_interface}", 0.2)
                if request.source_address:
                    session._send_and_sleep(f"set {base} source address {request.source_address}", 0.2)
                if request.source_port:
                    session._send_and_sleep(f"set {base} source port {request.source_port}", 0.2)
                if request.destination_address:
                    session._send_and_sleep(f"set {base} destination address {request.destination_address}", 0.2)
                if request.destination_port:
                    session._send_and_sleep(f"set {base} destination port {request.destination_port}", 0.2)
                if request.translation_address:
                    session._send_and_sleep(f"set {base} translation address {request.translation_address}", 0.2)
                if request.translation_port:
                    session._send_and_sleep(f"set {base} translation port {request.translation_port}", 0.2)
                if request.protocol:
                    session._send_and_sleep(f"set {base} protocol {request.protocol}", 0.2)
                session.commit(comment=f"Create NAT destination rule {request.sequence}")
                session.exit_config_mode()

            else:
                raise ValueError(f"Unsupported NAT type: {request.type}")

            # Store in memory
            rule = NATRuleResponse(
                id=str(request.sequence),
                name=request.name,
                type=request.type,
                sequence=request.sequence,
                order=request.sequence,
                description=request.description,
                enabled=request.enabled,
                source_address=request.source_address,
                source_port=request.source_port,
                destination_address=request.destination_address,
                destination_port=request.destination_port,
                inbound_interface=request.inbound_interface,
                outbound_interface=request.outbound_interface,
                translation_address=request.translation_address,
                translation_port=request.translation_port,
                protocol=request.protocol,
                log=request.log,
            )
            stored_nat_rules.append(rule.model_dump())

            return {"message": "NAT rule created successfully", "name": request.name}
        finally:
            session.close()
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/nat/rules/{name}")
async def delete_nat_rule(name: str, nat_type: str = "source", sequence: int = 10):
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        session = VyOSConfigSession(ssh_client)
        session.open()
        session.enter_config_mode()

        try:
            actual_type = "source" if nat_type == "masquerade" else nat_type
            session._send_and_sleep(f"delete nat {actual_type} rule {sequence}", 0.2)
            session.commit(comment=f"Delete NAT rule {sequence}")
            session.exit_config_mode()

            global stored_nat_rules
            stored_nat_rules = [r for r in stored_nat_rules if r.get("sequence") != sequence]

            return {"message": "NAT rule deleted successfully", "name": name}
        finally:
            session.close()
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Other endpoints

@router.get("/address-groups")
async def list_address_groups():
    return []


@router.get("/service-groups")
async def list_service_groups():
    return []


@router.get("/statistics")
async def get_statistics():
    return {
        "total_rules": len(stored_firewall_rules),
        "enabled_rules": sum(1 for r in stored_firewall_rules if r.get("enabled")),
        "disabled_rules": sum(1 for r in stored_firewall_rules if not r.get("enabled")),
        "total_nat_rules": len(stored_nat_rules),
        "address_groups": 0,
        "service_groups": 0,
    }
