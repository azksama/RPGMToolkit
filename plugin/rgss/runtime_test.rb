require 'tmpdir'
ENGINE = (ARGV[0] || '3').to_i
WIDTH = (ARGV[1] || '640').to_i
HEIGHT = (ARGV[2] || '480').to_i
module Graphics
  def self.update; end
  def self.width; WIDTH; end
  def self.height; HEIGHT; end
end
module Input
  F6=1; B=2; C=3; UP=4; DOWN=5; L=6; R=7; MOUSELEFT=8
  def self.update; end
  def self.trigger?(key); false; end
  def self.press?(key); false; end
  def self.repeat?(key); false; end
  def self.mouse_x; -1; end
  def self.mouse_y; -1; end
end
class Color; def initialize(*args); end; end
class Rect; def initialize(*args); end; end
class Bitmap
  attr_accessor :font
  def initialize(*args); @font=Struct.new(:size,:color).new; end
  def fill_rect(*args); end
  def draw_text(*args); end
  def blt(*args); end
  def dispose; @disposed=true; end
  def disposed?; !!@disposed; end
end
class Sprite
  attr_accessor :bitmap,:z,:x,:y,:visible
  def initialize; end
  def dispose; @disposed=true; end
  def disposed?; !!@disposed; end
end
class Scene_Map; end
class Scene_Battle; end
class Scene_Save; end
class Window_Base; end
Window_Base.class_eval { def draw_actor_mp; end } if ENGINE>=2
module RPG
  class System
    class Terms; end
  end
  module Cache
    def self.icon(name); Bitmap.new; end
  end
end
module Cache
  def self.system(name); Bitmap.new; end
end
if ENGINE==3
  module SceneManager
    def self.scene; $scene; end
    def self.call(scene); $scene=scene.new; end
  end
end
class Game_Variables
  def initialize; @data={}; end
  def [](id); @data.fetch(id,0); end
  def []=(id,v); @data[id]=v; end
end
class Game_Switches
  def initialize; @data={}; end
  def []=(id,v); @data[id]=v; end
  def [](id); !!@data[id]; end
end
class Game_SelfSwitches
  def initialize; @data={}; end
  def []=(id,v); @data[id]=v; end
  def [](id); !!@data[id]; end
end
class Game_Battler
  attr_accessor :hp,:sp,:mp,:tp,:level,:maxhp,:maxsp,:maxmp,:str,:dex,:agi,:int,:atk,:spi
  attr_reader :name,:id
  def initialize(id=1)
    @id=id; @name='Actor'; @hp=100; @mp=20; @sp=20; @tp=0; @maxhp=100; @maxsp=20; @maxmp=20; @level=1; @states=[]; @skills=[]; @params=Array.new(8,10)
    @str=@dex=@agi=@int=@atk=@spi=10
  end
  def mhp; 100; end
  def mmp; 20; end
  def add_state(id,*args); @states << id; end
  def remove_state(id); @states.delete(id); end
  def state?(id); @states.include?(id); end
  def death_state_id; 1; end
  def skills; @skills; end
  def skill_learn?(skill); @skills.include?(ENGINE==1 ? skill : skill.id); end
  def learn_skill(id); @skills << id unless @skills.include?(id); end
  def forget_skill(id); @skills.delete(id); end
  def change_level(level,show); @level=level; end
  def param(id); @params[id]; end
  def add_param(id,n); @params[id]+=n; end
  define_method(:def) { 10 }
  define_method(:def=) { |v| }
end
class Game_Actor < Game_Battler; end
class Game_Enemy < Game_Battler; end
if ENGINE<3
  Game_Battler.class_eval do
    [:mhp,:mmp,:tp,:tp=,:param,:add_param,:death_state_id].each { |method| remove_method(method) }
    if ENGINE==1
      [:mp,:mp=,:maxmp,:maxmp=,:change_level].each { |method| remove_method(method) }
    end
  end
end
class Party
  attr_accessor :gold
  def initialize; @gold=100; @items={}; end
  def members; [$game_actors[1]]; end
  alias actors members
  def item_number(item); @items.fetch(item.is_a?(Integer) ? item : item.id,0); end
  alias weapon_number item_number
  alias armor_number item_number
  def gain_item(item,n); id=item.is_a?(Integer) ? item : item.id; @items[id]=[[item_number(item)+n,0].max,99].min; end
  alias gain_weapon gain_item
  alias gain_armor gain_item
  def gain_gold(n); @gold+=n; end
end
Record=Struct.new(:id,:name,:icon_index,:icon_name)
$data_system=Struct.new(:variables,:switches).new(['']+(1..200).map { |i| 'Variable '+i.to_s },['','Switch'])
$data_items=[nil,Record.new(1,'Potion',1,'potion')]
$data_weapons=[nil,Record.new(1,'Sword',2,'sword')]
$data_armors=[nil,Record.new(1,'Armor',3,'armor')]
$data_actors=[nil,Record.new(1,'Actor',0,'')]
$data_skills=[nil,Record.new(1,'Fire',4,'fire')]
$data_states=[nil,Record.new(1,'KO',5,'state')]
$game_variables=Game_Variables.new; $game_switches=Game_Switches.new; $game_self_switches=Game_SelfSwitches.new
$game_actors=[nil,Game_Actor.new]; $game_party=Party.new
$game_map=Struct.new(:map_id,:events,:need_refresh).new(1,{1=>Object.new},false)
$game_player=Struct.new(:through).new(false)
$game_troop=Struct.new(:members).new([Game_Enemy.new])
$scene=Scene_Map.new
def load_data(path)
  return {1=>Struct.new(:name).new('Map')} if path.include?('MapInfos')
  Struct.new(:width,:height).new(20,20)
end
require_relative 'RPGMToolkit'
def check(value,message); raise message unless value; end
Dir.mktmpdir('rgss-test') do |dir|
 Dir.chdir(dir) do
  check(RPGMToolkit.engine==ENGINE,'engine detection')
  RPGMToolkit.tick
  variables=RPGMToolkit.records(:variables); check(variables.size==200,'catalog')
  r=variables[0]; RPGMToolkit.assign(r,99); check($game_variables[1]==99,'variable write')
  RPGMToolkit.frozen[RPGMToolkit.key(r)]=[r,99]; $game_variables[1]=0; check($game_variables[1]==99,'frozen setter')
  RPGMToolkit.assign(r,10); check($game_variables[1]==10,'editing frozen value')
  switch=RPGMToolkit.records(:switches)[0]; RPGMToolkit.assign(switch,true); check($game_switches[1],'switch')
  local=RPGMToolkit.records(:self_switches)[0]; RPGMToolkit.assign(local,true); check($game_self_switches[local[1]],'local switch')
  [:items,:weapons,:armors].each { |c| item=RPGMToolkit.records(c)[0]; RPGMToolkit.assign(item,5); check(RPGMToolkit.value(item)==5,'inventory '+c.to_s) }
  skill=RPGMToolkit.records(:skills)[0]; RPGMToolkit.assign(skill,true); check(RPGMToolkit.value(skill),'skill')
  RPGMToolkit.assign(skill,false); check(!RPGMToolkit.value(skill),'forget skill')
  RPGMToolkit.god=true; $game_actors[1].hp=0; $game_actors[1].add_state(1); check($game_actors[1].hp==100&&!$game_actors[1].state?(1),'godmode')
  enemy=$game_troop.members[0]; RPGMToolkit.set_resource(enemy,:hp,0); check(enemy.hp==0,'enemy HP')
  RPGMToolkit.noclip=true; RPGMToolkit.tick; check($game_player.through,'noclip'); RPGMToolkit.noclip=false; RPGMToolkit.tick; check(!$game_player.through,'restore collision')
  RPGMToolkit.prefs['aliases'][RPGMToolkit.key(r)]=[r[2],'English name']; RPGMToolkit.prefs['english']=true; RPGMToolkit.persist
  RPGMToolkit.instance_variable_set(:@prefs,nil); check(RPGMToolkit.name(r)=='English name','persistent alias')
  RPGMToolkit.export_aliases; RPGMToolkit.prefs['aliases']={}; RPGMToolkit.import_aliases; check(RPGMToolkit.name(r)=='English name','TSV import')
  ui=RPGMToolkit::UI.new
  [:home,:editors,:resources,:stats,:party,:teleport,:history,:translations,:settings].each do |mode|
    ui.mode(mode); ui.draw
    ui.instance_variable_get(:@buttons).each { |b| check(b[0]>=0&&b[1]>=0&&b[0]+b[2]<=WIDTH&&b[1]+b[3]<=HEIGHT,'clipped button '+mode.to_s) }
  end
  ui.mode(:editors); ui.edit([r]); ui.draw; ui.back; check(ui.instance_variable_get(:@mode)==:editors&&!ui.instance_variable_get(:@done),'modal close')
  ui.prompt('X,Y','0,0') {}; ui.draw; check(ui.instance_variable_get(:@max_scroll)>=0,'modal scrolling')
  $game_variables=Game_Variables.new; RPGMToolkit.tick; check(RPGMToolkit.frozen.empty?&&!RPGMToolkit.god,'new game isolation')
  puts "RGSS#{ENGINE}: runtime, persistence, controls and geometry passed"
 end
end
