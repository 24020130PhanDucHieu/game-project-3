"""Run in AWS CloudShell. Creates at most two tagged t3.micro judge machines.

Uses CloudShell's existing identity; never requests or prints access keys.
"""
import argparse
import hashlib
import json
import subprocess


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--gateway-id',required=True)
    parser.add_argument('--region',default='ap-southeast-1')
    args=parser.parse_args()
    def aws(*command):
        result=subprocess.run(['aws','--region',args.region,'--output','json',*command],capture_output=True,text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout or '{}')
    def instances(filters):
        response=aws('ec2','describe-instances','--filters',json.dumps(filters))
        return [i for r in response['Reservations'] for i in r['Instances']]
    response=aws('ec2','describe-instances','--instance-ids',args.gateway_id)
    gateway=response['Reservations'][0]['Instances'][0]
    if gateway['State']['Name']!='running' or gateway['InstanceType']!='t3.micro' or not gateway.get('KeyName'):
        raise RuntimeError('Expected the running t3.micro gateway with an SSH key pair')
    filters=[{'Name':'tag:ArenaGateway','Values':[args.gateway_id]},
             {'Name':'tag:ArenaRole','Values':['judge']},
             {'Name':'instance-state-name','Values':['pending','running','stopping','stopped']}]
    judges=instances(filters)
    if len(judges)>2:
        raise RuntimeError('More than two tagged judges already exist; refusing additional resources')
    group_name='arena-judges-'+args.gateway_id
    groups=aws('ec2','describe-security-groups','--filters',json.dumps([
        {'Name':'vpc-id','Values':[gateway['VpcId']]},{'Name':'group-name','Values':[group_name]}]))['SecurityGroups']
    group_id=groups[0]['GroupId'] if groups else aws('ec2','create-security-group','--group-name',group_name,
        '--description','Arena judges: SSH and judging only from gateway security groups',
        '--vpc-id',gateway['VpcId'])['GroupId']
    current=aws('ec2','describe-security-groups','--group-ids',group_id)['SecurityGroups'][0]['IpPermissions']
    for port in (22,8001):
        for source in gateway['SecurityGroups']:
            exists=any(p.get('IpProtocol')=='tcp' and p.get('FromPort')==port and p.get('ToPort')==port
                       and any(g.get('GroupId')==source['GroupId'] for g in p.get('UserIdGroupPairs',[])) for p in current)
            if not exists:
                aws('ec2','authorize-security-group-ingress','--group-id',group_id,'--ip-permissions',json.dumps([
                    {'IpProtocol':'tcp','FromPort':port,'ToPort':port,'UserIdGroupPairs':[{'GroupId':source['GroupId']}]}]))
    missing=2-len(judges)
    if missing:
        tags=[{'Key':'Name','Value':'arena-judge'},{'Key':'ArenaGateway','Value':args.gateway_id},{'Key':'ArenaRole','Value':'judge'}]
        # Deterministic token prevents duplicate launches if CloudShell retries.
        token=hashlib.sha256((args.gateway_id+':judges-v1:'+str(missing)).encode()).hexdigest()
        result=aws('ec2','run-instances','--image-id',gateway['ImageId'],'--instance-type','t3.micro',
            '--key-name',gateway['KeyName'],'--count',str(missing),'--client-token',token,
            '--metadata-options',json.dumps({'HttpTokens':'required','HttpEndpoint':'enabled'}),
            '--credit-specification','CpuCredits=standard',
            '--network-interfaces',json.dumps([{'DeviceIndex':0,'SubnetId':gateway['SubnetId'],
                'Groups':[group_id],'AssociatePublicIpAddress':True,'DeleteOnTermination':True}]),
            '--block-device-mappings',json.dumps([{'DeviceName':gateway['RootDeviceName'],
                'Ebs':{'VolumeSize':8,'VolumeType':'gp3','Encrypted':True,'DeleteOnTermination':True}}]),
            '--tag-specifications',json.dumps([{'ResourceType':'instance','Tags':tags}]))
        judges.extend(result['Instances'])
    stopped=[i['InstanceId'] for i in judges if i['State']['Name']=='stopped']
    if stopped: aws('ec2','start-instances','--instance-ids',*stopped)
    ids=[i['InstanceId'] for i in judges]
    aws('ec2','wait','instance-running','--instance-ids',*ids)
    judges=instances(filters)
    output=[]
    for index,i in enumerate(sorted(judges,key=lambda i:i['InstanceId']),1):
        aws('ec2','create-tags','--resources',i['InstanceId'],'--tags',json.dumps([{'Key':'Name','Value':'bot-judge-'+str(index)}]))
        output.append({'instance_id':i['InstanceId'],'private_ip':i['PrivateIpAddress'],'public_ip':i.get('PublicIpAddress'),
                       'type':i['InstanceType'],'state':i['State']['Name']})
    print(json.dumps({'gateway_id':args.gateway_id,'gateway_private_ip':gateway['PrivateIpAddress'],'region':args.region,'judge_security_group':group_id,'judges':output},indent=2))
    print('Machines created; software deployment and capacity verification are still required.')


if __name__=='__main__':
    main()
